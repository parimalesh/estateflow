"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Home as HomeIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

type UserRole = "ADMIN" | "SALES_EMPLOYEE";
type User = { id: string; name: string; email: string; role: UserRole };
type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  source: string | null;
  status: string;
  budget: string | number | null;
  notes: string | null;
  propertyName: string | null;
  assignedToId: string | null;
  assignedTo: { id: string; name: string; email: string } | null;
  createdAt: string;
};
type Unit = {
  id: string;
  unitNumber: string;
  floor: number | null;
  type: string;
  price: string | number;
  status: string;
};
type Property = {
  id: string;
  name: string;
  location: string;
  description: string | null;
  buildings: Array<{ id: string; name: string; units: Unit[] }>;
};
type Booking = {
  id: string;
  status: string;
  amount: string | number;
  bookedAt: string;
  lead: { id: string; name: string; phone: string; status: string };
  unit: Unit & {
    building: {
      name: string;
      property: { name: string; location: string };
    };
  };
  user: { id: string; name: string };
};
type FollowUp = {
  id: string;
  scheduledAt: string;
  notes: string;
  completed: boolean;
  lead: { id: string; name: string; phone: string; status: string };
  user: { id: string; name: string } | null;
};
type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  assignedLeadsCount?: number;
  activeBookingsCount?: number;
};
type DashboardData = {
  counts: {
    leadCount: number;
    newLeadCount: number;
    bookedLeadCount: number;
    propertyCount: number;
    unitCount: number;
    availableUnitCount: number;
    blockedUnitCount: number;
    pendingBookingCount: number;
    confirmedBookingCount: number;
    cancelledBookingCount: number;
    overdueFollowUpCount: number;
    dueTodayCount: number;
    upcomingFollowUpCount: number;
    openFollowUpCount: number;
    completedFollowUpCount: number;
  };
  activeBookingCount: number;
  activeBookingValue: string | number;
  recentLeads: Array<{
    id: string;
    name: string;
    phone: string;
    status: string;
    propertyName: string | null;
    budget: string | number | null;
    createdAt: string;
  }>;
  recentBookings: Booking[];
  monthlyRevenue: Array<{ month: string; amount: number }>;
};
type SearchResult = {
  id: string;
  kind: "lead" | "property" | "unit" | "booking";
  title: string;
  detail: string;
  propertyId?: string;
};
type Workspace = {
  leads: Lead[];
  properties: Property[];
  bookings: Booking[];
  followUps: FollowUp[];
  users: TeamMember[];
  dashboard: DashboardData;
};
type ModalState =
  | { kind: "lead"; lead?: Lead }
  | { kind: "follow-up"; leadId?: string; followUp?: FollowUp }
  | { kind: "booking" }
  | { kind: "property" }
  | { kind: "property-edit"; property: Property }
  | { kind: "unit"; propertyId: string; buildingId: string; unit?: Unit }
  | { kind: "employee"; member?: TeamMember }
  | null;

const LEAD_STAGES = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "SITE_VISIT", label: "Site visit" },
  { value: "INTERESTED", label: "Interested" },
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "BOOKED", label: "Booked" },
  { value: "LOST", label: "Lost" },
];
const UNIT_TYPES = [
  ["STUDIO", "Studio"],
  ["ONE_BEDROOM", "1 bedroom"],
  ["TWO_BEDROOM", "2 bedroom"],
  ["THREE_BEDROOM", "3 bedroom"],
  ["FOUR_BEDROOM", "4 bedroom"],
  ["VILLA", "Villa"],
  ["PLOT", "Plot"],
  ["COMMERCIAL", "Commercial"],
] as const;
const NAVIGATION: Array<{ name: string; icon: LucideIcon }> = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Leads", icon: Users },
  { name: "Properties", icon: Building2 },
  { name: "Bookings", icon: ShieldCheck },
  { name: "Follow-ups", icon: CalendarDays },
];
const SIDEBAR_PREFERENCE_KEY = "estateflow-sidebar-collapsed";
const SIDEBAR_PREFERENCE_EVENT = "estateflow-sidebar-preference-change";
let sidebarPreferenceFallback: boolean | null = null;

function readSidebarPreference() {
  if (sidebarPreferenceFallback !== null) return sidebarPreferenceFallback;
  try {
    return window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === "true";
  } catch {
    return sidebarPreferenceFallback;
  }
}

function subscribeSidebarPreference(onChange: () => void) {
  function onStorageChange() {
    sidebarPreferenceFallback = null;
    onChange();
  }
  window.addEventListener("storage", onStorageChange);
  window.addEventListener(SIDEBAR_PREFERENCE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorageChange);
    window.removeEventListener(SIDEBAR_PREFERENCE_EVENT, onChange);
  };
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiRequest<T>(
  path: string,
  body?: Record<string, unknown>,
  method = body ? "POST" : "GET",
): Promise<T> {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result: unknown = await response.json();

  if (!response.ok) {
    const message =
      result !== null &&
      typeof result === "object" &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : "The request could not be completed.";
    throw new ApiError(message, response.status);
  }

  return result as T;
}

async function loadWorkspace(): Promise<Workspace> {
  const [leads, properties, bookings, followUps, users, dashboard] = await Promise.all([
    apiRequest<Lead[]>("/api/leads"),
    apiRequest<Property[]>("/api/properties"),
    apiRequest<Booking[]>("/api/bookings"),
    apiRequest<FollowUp[]>("/api/follow-ups"),
    apiRequest<TeamMember[]>("/api/users"),
    apiRequest<DashboardData>("/api/dashboard"),
  ]);
  return { leads, properties, bookings, followUps, users, dashboard };
}

function money(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function stageLabel(status: string) {
  return LEAD_STAGES.find((stage) => stage.value === status)?.label ?? status;
}

function readableType(type: string) {
  return UNIT_TYPES.find(([value]) => value === type)?.[1] ?? type;
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function dateTimeLabel(date: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function isDue(followUp: FollowUp) {
  return !followUp.completed && new Date(followUp.scheduledAt) <= new Date();
}

function fieldClass() {
  return "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#87988b] focus:ring-4 focus:ring-[#607568]/10";
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="modal-title"
        aria-modal="true"
        className="crm-dialog max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-7"
        role="dialog"
      >
        <div className="mb-6 flex items-start justify-between gap-5">
          <div>
            <h2 id="modal-title" className="text-xl font-bold tracking-tight">
              {title}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">{description}</p>
          </div>
          <button
            aria-label="Close dialog"
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p
      aria-live="polite"
      className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700"
      role="alert"
    >
      {message}
    </p>
  );
}

function AuthScreen({
  setupAvailable,
  setupRequired,
  error,
  onSubmit,
}: {
  setupAvailable: boolean;
  setupRequired: boolean;
  error: string;
  onSubmit: (body: Record<string, unknown>, setup: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      await onSubmit(body, setupAvailable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#fffefa] lg:grid-cols-[1fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#17211f] px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -right-36 -top-32 h-[440px] w-[440px] rounded-full border border-white/10" />
        <div className="absolute -right-8 -top-5 h-[290px] w-[290px] rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3">
          <span className="crm-logo-mark relative grid h-11 w-11 place-items-center rounded-2xl text-[#efe5d2]">
            <Building2 size={22} strokeWidth={1.8} />
          </span>
          <span className="text-lg font-bold tracking-tight">
            EstateFlow<span className="text-[#c5aa7a]">.</span>
          </span>
        </div>
        <div className="relative max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c5aa7a]">
            Your sales workspace
          </p>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.13] tracking-[-0.04em]">
            Every lead has a next step.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-300">
            Keep customer conversations, property availability, and bookings
            moving together in one clear view.
          </p>
          <div className="mt-12 flex items-center gap-3 text-sm text-slate-300">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#9bad9b]/15 text-[#c1d0c0]">
              <ShieldCheck size={16} />
            </span>
            Private, role-based workspace
          </div>
        </div>
        <p className="relative text-xs text-slate-500">
          © {new Date().getFullYear()} EstateFlow · Real estate sales CRM
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[410px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="crm-logo-mark relative grid h-10 w-10 place-items-center rounded-xl text-[#efe5d2]">
              <Building2 size={21} strokeWidth={1.8} />
            </span>
            <span className="text-lg font-bold">
              EstateFlow<span className="text-[#9d8357]">.</span>
            </span>
          </div>
          <p className="text-sm font-semibold text-[#607568]">
            {setupAvailable
              ? "Workspace setup"
              : setupRequired
                ? "Workspace configuration required"
                : "Welcome back"}
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {setupAvailable
              ? "Create your admin account"
              : setupRequired
                ? "Contact your administrator"
                : "Sign in to EstateFlow"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {setupAvailable
              ? "Set up the workspace owner. You can invite sales employees after signing in."
              : setupRequired
                ? "This workspace has not been initialized. The workspace owner needs to configure ADMIN_SETUP_KEY on the server before creating the first account."
                : "Use your team account to access your sales workspace."}
          </p>

          {!setupRequired || setupAvailable ? (
            <form className="mt-8 space-y-4" onSubmit={submit}>
            {setupAvailable && (
              <>
                <label className="block text-sm font-medium text-slate-700">
                  Your name
                  <input
                    autoComplete="name"
                    className={fieldClass()}
                    minLength={2}
                    name="name"
                    placeholder="Alex Morgan"
                    required
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Workspace setup key
                  <input
                    autoComplete="off"
                    className={fieldClass()}
                    name="setupKey"
                    required
                    type="password"
                  />
                </label>
              </>
            )}
            <label className="block text-sm font-medium text-slate-700">
              Work email
              <input
                autoComplete="email"
                className={fieldClass()}
                name="email"
                placeholder="you@company.com"
                required
                type="email"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                autoComplete={setupAvailable ? "new-password" : "current-password"}
                className={fieldClass()}
                minLength={setupAvailable ? 12 : undefined}
                name="password"
                placeholder={setupAvailable ? "At least 12 characters" : "••••••••••••"}
                required
                type="password"
              />
            </label>
            {error && <FormError message={error} />}
            <button
              className="crm-primary-button flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
              type="submit"
            >
              {busy
                ? "Please wait…"
                : setupAvailable
                  ? "Create workspace"
                  : "Sign in"}
              {!busy && <ArrowRight size={16} />}
            </button>
            </form>
          ) : null}
          <p className="mt-6 text-center text-xs leading-5 text-slate-400">
            Your session is private and protected with a salted password hash.
          </p>
        </div>
      </section>
    </main>
  );
}

function LeadDialog({
  lead,
  users,
  canAssign,
  onClose,
  onSave,
  onDelete,
}: {
  lead?: Lead;
  users: TeamMember[];
  canAssign: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const budget = String(form.get("budget") ?? "").trim();
    const body: Record<string, unknown> = {
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim() || null,
      phone: String(form.get("phone") ?? "").trim(),
      source: String(form.get("source") ?? "").trim() || null,
      propertyName: String(form.get("propertyName") ?? "").trim() || null,
      notes: String(form.get("notes") ?? "").trim() || null,
      budget: budget ? Number(budget) : null,
    };
    if (lead) body.status = form.get("status");
    if (canAssign) {
      body.assignedToId = String(form.get("assignedToId") ?? "") || null;
    }

    try {
      await onSave(body);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save this lead.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={lead ? "Edit lead" : "Add a new lead"}
      description="Keep the customer details and next conversation in one place."
      onClose={onClose}
    >
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Full name
            <input
              autoComplete="name"
              className={fieldClass()}
              defaultValue={lead?.name ?? ""}
              maxLength={120}
              minLength={2}
              name="name"
              placeholder="Customer name"
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Phone
            <input
              autoComplete="tel"
              className={fieldClass()}
              defaultValue={lead?.phone ?? ""}
              maxLength={24}
              name="phone"
              placeholder="+91 98765 43210"
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Email <span className="font-normal text-slate-400">· optional</span>
            <input
              autoComplete="email"
              className={fieldClass()}
              defaultValue={lead?.email ?? ""}
              name="email"
              placeholder="name@example.com"
              type="email"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Interested project
            <input
              className={fieldClass()}
              defaultValue={lead?.propertyName ?? ""}
              maxLength={160}
              name="propertyName"
              placeholder="e.g. Cedar Grove"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Budget · INR
            <input
              className={fieldClass()}
              defaultValue={lead?.budget ?? ""}
              min="0"
              name="budget"
              placeholder="7500000"
              step="1000"
              type="number"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Lead source
            <input
              className={fieldClass()}
              defaultValue={lead?.source ?? ""}
              maxLength={80}
              name="source"
              placeholder="Website, referral, walk-in…"
            />
          </label>
          {lead && (
            <label className="text-sm font-medium text-slate-700">
              Stage
              <select
                className={fieldClass()}
                defaultValue={lead.status}
                name="status"
              >
                {LEAD_STAGES.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {canAssign && (
            <label className="text-sm font-medium text-slate-700">
              Assigned to
              <select
                className={fieldClass()}
                defaultValue={lead?.assignedToId ?? ""}
                name="assignedToId"
              >
                <option value="">Unassigned</option>
                {users
                  .filter((user) => user.role === "SALES_EMPLOYEE")
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Notes
          <textarea
            className={`${fieldClass()} min-h-24 resize-y`}
            defaultValue={lead?.notes ?? ""}
            maxLength={4000}
            name="notes"
            placeholder="Conversation context, preferences, or next steps…"
            rows={3}
          />
        </label>
        {error && <FormError message={error} />}
        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          {lead && onDelete && (
            <button
              className="mr-auto rounded-xl px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
              onClick={async () => {
                if (!window.confirm(`Delete ${lead.name}? Their follow-ups will also be deleted. Leads with booking history cannot be deleted.`)) return;
                setBusy(true);
                setError("");
                try {
                  await onDelete();
                } catch (deleteError) {
                  setError(deleteError instanceof Error ? deleteError.message : "Could not delete this lead.");
                } finally {
                  setBusy(false);
                }
              }}
              type="button"
            >
              Delete lead
            </button>
          )}
          <button
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? "Saving…" : lead ? "Save changes" : "Create lead"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FollowUpDialog({
  leads,
  users,
  isAdmin,
  selectedLeadId,
  followUp,
  onClose,
  onSave,
}: {
  leads: Lead[];
  users: TeamMember[];
  isAdmin: boolean;
  selectedLeadId?: string;
  followUp?: FollowUp;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onSave({
        ...(followUp ? { id: followUp.id } : {}),
        leadId: form.get("leadId"),
        scheduledAt: new Date(String(form.get("scheduledAt"))).toISOString(),
        notes: form.get("notes"),
        ...(isAdmin ? { userId: form.get("userId") || null } : {}),
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this follow-up.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={followUp ? "Edit follow-up" : "Schedule a follow-up"}
      description="A clear reminder helps every customer conversation move forward."
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm font-medium text-slate-700">
          Lead
          <select
            className={fieldClass()}
            defaultValue={followUp?.lead.id ?? selectedLeadId ?? ""}
            name="leadId"
            required
          >
            <option disabled value="">
              Choose a lead
            </option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.name} · {stageLabel(lead.status)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Date and time
          <input
            className={fieldClass()}
            defaultValue={
              followUp
                ? new Date(
                    new Date(followUp.scheduledAt).getTime() -
                      new Date(followUp.scheduledAt).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : undefined
            }
            name="scheduledAt"
            required
            type="datetime-local"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Reminder
          <textarea
            className={`${fieldClass()} min-h-24`}
            defaultValue={followUp?.notes ?? ""}
            maxLength={2000}
            name="notes"
            placeholder="What should happen next?"
            required
            rows={3}
          />
        </label>
        {isAdmin && (
          <label className="block text-sm font-medium text-slate-700">
            Assigned employee
            <select className={fieldClass()} defaultValue={followUp?.user?.id ?? ""} name="userId">
              <option value="">Assign to me</option>
              {users.filter((member) => member.role === "SALES_EMPLOYEE").map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </label>
        )}
        {error && <FormError message={error} />}
        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy || leads.length === 0}
            type="submit"
          >
            {busy
              ? "Saving…"
              : followUp
                ? "Save changes"
                : "Schedule reminder"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BookingDialog({
  leads,
  properties,
  users,
  isAdmin,
  onClose,
  onSave,
}: {
  leads: Lead[];
  properties: Property[];
  users: TeamMember[];
  isAdmin: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const bookableLeads = leads.filter(
    (lead) => !["BOOKED", "LOST"].includes(lead.status),
  );
  const [propertyId, setPropertyId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const availableUnits = properties
    .filter((property) => !propertyId || property.id === propertyId)
    .flatMap((property) =>
      property.buildings.flatMap((building) =>
        building.units
          .filter((unit) => unit.status === "AVAILABLE")
          .map((unit) => ({
            ...unit,
            buildingName: building.name,
            propertyName: property.name,
          })),
      ),
    );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onSave({
        leadId: form.get("leadId"),
        unitId: form.get("unitId"),
        amount: form.get("amount"),
        bookedAt: form.get("bookedAt"),
        ...(isAdmin ? { userId: form.get("userId") } : {}),
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not place booking.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Reserve a property unit"
      description="The unit will be locked for this customer as soon as the booking is placed."
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm font-medium text-slate-700">
          Customer lead
          <select className={fieldClass()} defaultValue="" name="leadId" required>
            <option disabled value="">
              Choose a customer
            </option>
            {bookableLeads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.name} · {lead.phone}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Property
          <select
            className={fieldClass()}
            onChange={(event) => setPropertyId(event.target.value)}
            value={propertyId}
          >
            <option value="">All projects</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Available unit
          <select className={fieldClass()} defaultValue="" name="unitId" required>
            <option disabled value="">
              Choose a unit
            </option>
            {availableUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.propertyName} · {unit.buildingName} · {unit.unitNumber} ·{" "}
                {readableType(unit.type)} · {money(unit.price)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Booking amount · INR
            <input
              className={fieldClass()}
              min="1"
              name="amount"
              placeholder="Unit price"
              step="1000"
              type="number"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Booking date
            <input
              className={fieldClass()}
              name="bookedAt"
              required
              type="date"
            />
          </label>
        </div>
        {isAdmin && (
          <label className="block text-sm font-medium text-slate-700">
            Responsible sales employee
            <select className={fieldClass()} defaultValue="" name="userId">
              <option value="">Assign to me</option>
              {users
                .filter((member) => member.role === "SALES_EMPLOYEE")
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {!bookableLeads.length && (
          <p className="text-sm text-amber-700">
            Add an open lead before creating a booking.
          </p>
        )}
        {!availableUnits.length && (
          <p className="text-sm text-amber-700">
            There are no available units right now.
          </p>
        )}
        {error && <FormError message={error} />}
        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy || !bookableLeads.length || !availableUnits.length}
            type="submit"
          >
            {busy ? "Reserving…" : "Confirm booking"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditPropertyDialog({
  property,
  onClose,
  onSave,
}: {
  property: Property;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onSave({
        id: property.id,
        name: form.get("name"),
        location: form.get("location"),
        description: form.get("description"),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit project" description="Update project details." onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm font-medium text-slate-700">
          Project name
          <input className={fieldClass()} defaultValue={property.name} maxLength={160} minLength={2} name="name" required />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Location
          <input className={fieldClass()} defaultValue={property.location} maxLength={200} name="location" required />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Description
          <textarea className={`${fieldClass()} min-h-24`} defaultValue={property.description ?? ""} maxLength={2000} name="description" rows={3} />
        </label>
        {error && <FormError message={error} />}
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600" onClick={onClose} type="button">Cancel</button>
          <button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} type="submit">{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}

function UnitDialog({
  buildingId,
  unit,
  onClose,
  onSave,
  onDelete,
}: {
  buildingId: string;
  unit?: Unit;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onSave({
        ...(unit ? { id: unit.id } : { buildingId }),
        unitNumber: form.get("unitNumber"),
        floor: form.get("floor") || null,
        type: form.get("type"),
        price: form.get("price"),
        status: form.get("status"),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save unit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={unit ? "Edit unit" : "Add a unit"} description="Manage unit details and availability." onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Unit number<input className={fieldClass()} defaultValue={unit?.unitNumber ?? ""} maxLength={40} name="unitNumber" required /></label>
          <label className="text-sm font-medium text-slate-700">Floor<input className={fieldClass()} defaultValue={unit?.floor ?? ""} min="0" name="floor" type="number" /></label>
          <label className="text-sm font-medium text-slate-700">Type<select className={fieldClass()} defaultValue={unit?.type ?? "TWO_BEDROOM"} name="type">{UNIT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Price · INR<input className={fieldClass()} defaultValue={unit?.price ?? ""} min="1" name="price" required step="1000" type="number" /></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Availability<select className={fieldClass()} defaultValue={unit?.status ?? "AVAILABLE"} name="status"><option value="AVAILABLE">Available</option><option value="BLOCKED">Blocked</option></select></label>
        </div>
        <p className="text-xs leading-5 text-slate-400">Units with active bookings are managed through the booking record.</p>
        {error && <FormError message={error} />}
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          {unit && onDelete && (
            <button
              className="mr-auto rounded-xl px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
              onClick={async () => {
                if (!window.confirm(`Delete unit ${unit.unitNumber}? Units with booking history cannot be deleted.`)) return;
                setBusy(true);
                setError("");
                try {
                  await onDelete();
                } catch (deleteError) {
                  setError(deleteError instanceof Error ? deleteError.message : "Could not delete this unit.");
                } finally {
                  setBusy(false);
                }
              }}
              type="button"
            >
              Delete unit
            </button>
          )}
          <button className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600" onClick={onClose} type="button">Cancel</button>
          <button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} type="submit">{busy ? "Saving…" : unit ? "Save unit" : "Add unit"}</button>
        </div>
      </form>
    </Modal>
  );
}

function PropertyDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const count = Number(form.get("unitCount"));
    const firstUnit = String(form.get("firstUnit") ?? "").trim();
    const startNumber = Number.parseInt(firstUnit.replace(/\D/g, ""), 10);
    const type = String(form.get("type"));
    const price = Number(form.get("price"));
    try {
      await onSave({
        name: form.get("name"),
        location: form.get("location"),
        description: form.get("description"),
        buildings: [
          {
            name: form.get("building"),
            units: Array.from({ length: count }, (_, index) => ({
              unitNumber: Number.isFinite(startNumber)
                ? String(startNumber + index)
                : `${firstUnit}-${index + 1}`,
              floor: Math.floor(index / 4) + 1,
              type,
              price,
            })),
          },
        ],
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not create this project.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Add a property project"
      description="Create the project, first building, and its initial unit inventory."
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Project name
            <input
              className={fieldClass()}
              maxLength={160}
              minLength={2}
              name="name"
              placeholder="Cedar Grove Residences"
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Location
            <input
              className={fieldClass()}
              maxLength={200}
              name="location"
              placeholder="OMR, Chennai"
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            First building
            <input
              className={fieldClass()}
              maxLength={100}
              name="building"
              placeholder="Tower A"
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Unit type
            <select className={fieldClass()} defaultValue="TWO_BEDROOM" name="type">
              {UNIT_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Starting unit number
            <input
              className={fieldClass()}
              defaultValue="101"
              maxLength={40}
              name="firstUnit"
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Number of units
            <input
              className={fieldClass()}
              defaultValue="8"
              max="50"
              min="1"
              name="unitCount"
              required
              type="number"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Price per unit · INR
            <input
              className={fieldClass()}
              min="1"
              name="price"
              placeholder="7500000"
              required
              step="1000"
              type="number"
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Project notes <span className="font-normal text-slate-400">· optional</span>
          <textarea
            className={`${fieldClass()} min-h-20`}
            maxLength={2000}
            name="description"
            placeholder="A short overview for the sales team."
            rows={2}
          />
        </label>
        {error && <FormError message={error} />}
        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EmployeeDialog({
  member,
  onClose,
  onSave,
}: {
  member?: TeamMember;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onSave({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        ...(member ? { id: member.id } : {}),
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this employee.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={member ? "Edit team member" : "Invite a sales employee"}
      description={member ? "Update employee details or reset their password." : "Create a role-limited account for a member of your team."}
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm font-medium text-slate-700">
          Full name
          <input
            autoComplete="name"
            className={fieldClass()}
            defaultValue={member?.name ?? ""}
            minLength={2}
            name="name"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Work email
          <input
            autoComplete="email"
            className={fieldClass()}
            defaultValue={member?.email ?? ""}
            name="email"
            required
            type="email"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Temporary password
          <input
            autoComplete="new-password"
            className={fieldClass()}
            minLength={member ? undefined : 12}
            name="password"
            required={!member}
            type="password"
          />
          <span className="mt-1 block text-xs font-normal text-slate-400">
            {member ? "Leave blank to keep the current password." : "Use at least 12 characters and share it with the employee securely."}
          </span>
        </label>
        {error && <FormError message={error} />}
        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? "Saving…" : member ? "Save employee" : "Create employee"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon size={21} />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-500">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function StageBadge({ status }: { status: string }) {
  const color =
    status === "BOOKED"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/10"
      : status === "LOST"
        ? "bg-slate-100 text-slate-500 ring-slate-500/10"
        : status === "NEGOTIATION"
          ? "bg-violet-50 text-violet-700 ring-violet-600/10"
          : status === "SITE_VISIT"
            ? "bg-amber-50 text-amber-700 ring-amber-600/10"
            : "bg-blue-50 text-blue-700 ring-blue-600/10";
  return (
    <span className={`inline-flex rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset ${color}`}>
      {stageLabel(status)}
    </span>
  );
}

function PrimaryButton({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      className={`crm-primary-button inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [setupAvailable, setSetupAvailable] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [workspace, setWorkspace] = useState<Workspace>({
    leads: [],
    properties: [],
    bookings: [],
    followUps: [],
    users: [],
    dashboard: {
      counts: {
        leadCount: 0,
        newLeadCount: 0,
        bookedLeadCount: 0,
        propertyCount: 0,
        unitCount: 0,
        availableUnitCount: 0,
        blockedUnitCount: 0,
        pendingBookingCount: 0,
        confirmedBookingCount: 0,
        cancelledBookingCount: 0,
        overdueFollowUpCount: 0,
        dueTodayCount: 0,
        upcomingFollowUpCount: 0,
        openFollowUpCount: 0,
        completedFollowUpCount: 0,
      },
      activeBookingCount: 0,
      activeBookingValue: 0,
      recentLeads: [],
      recentBookings: [],
      monthlyRevenue: [],
    },
  });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [active, setActive] = useState("Overview");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [propertySearch, setPropertySearch] = useState("");
  const [unitSearch, setUnitSearch] = useState("");
  const [unitStatusFilter, setUnitStatusFilter] = useState("ALL");
  const [followUpFilter, setFollowUpFilter] = useState("OPEN");
  const [followUpSearch, setFollowUpSearch] = useState("");
  const [followUpEmployee, setFollowUpEmployee] = useState("ALL");
  const [teamSearch, setTeamSearch] = useState("");
  const [teamRoleFilter, setTeamRoleFilter] = useState("ALL");
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("ALL");
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalResults, setGlobalResults] = useState<SearchResult[]>([]);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const sidebarCollapsed = useSyncExternalStore(
    subscribeSidebarPreference,
    readSidebarPreference,
    () => false,
  );
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setWorkspace(await loadWorkspace());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
      }
      setLoadError(
        error instanceof Error ? error.message : "Unable to load the workspace.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        const session = await apiRequest<{
          user: User | null;
          setupAvailable: boolean;
          setupRequired: boolean;
        }>("/api/auth");
        setUser(session.user);
        setSetupAvailable(session.setupAvailable);
        setSetupRequired(session.setupRequired);
        if (session.user) await reload();
      } catch (error) {
        setAuthError(
          error instanceof Error
            ? error.message
            : "Unable to connect to the workspace.",
        );
      } finally {
        setAuthLoading(false);
      }
    }
    void bootstrap();
  }, [reload]);

  useEffect(() => {
    if (!mobileMenu) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenu(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenu]);

  function setSidebarCollapsed(collapsed: boolean) {
    sidebarPreferenceFallback = collapsed;
    try {
      window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(collapsed));
    } catch {
      // The in-memory value keeps the toggle usable when storage is unavailable.
    }
    window.dispatchEvent(new Event(SIDEBAR_PREFERENCE_EVENT));
  }

  useEffect(() => {
    const search = globalQuery.trim();
    if (search.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(search)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("Search is temporarily unavailable.");
        const results: SearchResult[] = await response.json();
        setGlobalResults(results);
      } catch {
        if (!controller.signal.aborted) setGlobalResults([]);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [globalQuery]);

  async function authenticate(body: Record<string, unknown>, setup: boolean) {
    setAuthError("");
    try {
      const session = await apiRequest<{ user: User }>(
        setup ? "/api/auth/setup" : "/api/auth",
        body,
      );
      setUser(session.user);
      setSetupAvailable(false);
      await reload();
    } catch (error) {
      if (setup && error instanceof ApiError && error.status === 409) {
        setSetupAvailable(false);
        setSetupRequired(false);
        setAuthError("An administrator already exists. Sign in with that account.");
        return;
      }
      setAuthError(
        error instanceof Error ? error.message : "Unable to sign in.",
      );
    }
  }

  async function logout() {
    try {
      await apiRequest<{ success: boolean }>("/api/auth", {}, "DELETE");
      setUser(null);
      setWorkspace({
        leads: [],
        properties: [],
        bookings: [],
        followUps: [],
        users: [],
        dashboard: {
          counts: {
            leadCount: 0, newLeadCount: 0, bookedLeadCount: 0,
            propertyCount: 0, unitCount: 0, availableUnitCount: 0,
            blockedUnitCount: 0, pendingBookingCount: 0,
            confirmedBookingCount: 0, cancelledBookingCount: 0,
            overdueFollowUpCount: 0, dueTodayCount: 0,
            upcomingFollowUpCount: 0, openFollowUpCount: 0,
            completedFollowUpCount: 0,
          },
          activeBookingCount: 0,
          activeBookingValue: 0,
          recentLeads: [],
          recentBookings: [],
          monthlyRevenue: [],
        },
      });
      setActive("Overview");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to sign out.");
    }
  }

  async function saveRecord(
    endpoint: string,
    body: Record<string, unknown>,
    method = "POST",
    successMessage = "Changes saved.",
  ) {
    setSaving(true);
    try {
      await apiRequest(endpoint, body, method);
      await reload();
      setNotice(successMessage);
      setModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function changeLeadStatus(id: string, status: string) {
    try {
      await saveRecord(
        "/api/leads",
        { id, status },
        "PATCH",
        "Lead stage updated.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update lead.");
    }
  }

  async function toggleFollowUp(followUp: FollowUp) {
    try {
      await saveRecord(
        "/api/follow-ups",
        { id: followUp.id, completed: !followUp.completed },
        "PATCH",
        followUp.completed ? "Follow-up reopened." : "Follow-up completed.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not update reminder.",
      );
    }
  }

  async function changeBookingStatus(booking: Booking, status: string) {
    const confirmation =
      status === "CANCELLED"
        ? `Cancel the booking for ${booking.lead.name}? The unit will become available again.`
        : `Confirm the booking for ${booking.lead.name}?`;
    if (!window.confirm(confirmation)) return;
    try {
      await saveRecord(
        "/api/bookings",
        { id: booking.id, status },
        "PATCH",
        status === "CANCELLED" ? "Booking cancelled." : "Booking confirmed.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not update booking.",
      );
    }
  }

  const navItems =
    user?.role === "ADMIN"
      ? [...NAVIGATION, { name: "Sales Team", icon: Users }]
      : NAVIGATION;
  const dueFollowUps = workspace.followUps.filter(isDue);
  const filteredFollowUps = workspace.followUps.filter((followUp) => {
    const searchText =
      `${followUp.lead.name} ${followUp.lead.phone} ${followUp.notes} ${followUp.user?.name ?? ""}`.toLowerCase();
    const today = new Date();
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const scheduledAt = new Date(followUp.scheduledAt);
    const matchesStatus =
      followUpFilter === "ALL" ||
      (followUpFilter === "COMPLETED" && followUp.completed) ||
      (followUpFilter === "OPEN" && !followUp.completed) ||
      (followUpFilter === "OVERDUE" && isDue(followUp) && scheduledAt < todayStart) ||
      (followUpFilter === "TODAY" && !followUp.completed && scheduledAt >= todayStart && scheduledAt < tomorrowStart) ||
      (followUpFilter === "UPCOMING" && !followUp.completed && scheduledAt >= tomorrowStart);
    const matchesEmployee =
      followUpEmployee === "ALL" || followUp.user?.id === followUpEmployee;
    return (
      matchesStatus &&
      matchesEmployee &&
      searchText.includes(followUpSearch.toLowerCase())
    );
  });
  const filteredTeam = workspace.users.filter((member) => {
    const matchesSearch =
      `${member.name} ${member.email}`.toLowerCase().includes(teamSearch.toLowerCase());
    const matchesRole = teamRoleFilter === "ALL" || member.role === teamRoleFilter;
    return matchesSearch && matchesRole;
  });
  const filteredBookings = workspace.bookings.filter((booking) => {
    const text = `${booking.lead.name} ${booking.lead.phone} ${booking.unit.unitNumber} ${booking.unit.building.property.name} ${booking.user.name}`.toLowerCase();
    return (
      text.includes(bookingSearch.toLowerCase()) &&
      (bookingStatusFilter === "ALL" || booking.status === bookingStatusFilter)
    );
  });
  const filteredLeads = workspace.leads.filter((lead) => {
    const searchText =
      `${lead.name} ${lead.email ?? ""} ${lead.phone} ${lead.propertyName ?? ""} ${lead.assignedTo?.name ?? ""}`.toLowerCase();
    return (
      searchText.includes(query.toLowerCase()) &&
      (stageFilter === "ALL" || lead.status === stageFilter)
    );
  });
  const filteredProperties = workspace.properties.filter((property) =>
    `${property.name} ${property.location}`.toLowerCase().includes(propertySearch.toLowerCase()),
  );
  const activeUnitCount = workspace.properties.reduce(
    (total, property) =>
      total +
      property.buildings.reduce(
        (buildingTotal, building) => buildingTotal + building.units.length,
        0,
      ),
    0,
  );

  if (authLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f7fb]">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          Connecting to your workspace…
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        error={authError}
        onSubmit={authenticate}
        setupAvailable={setupAvailable}
        setupRequired={setupRequired}
      />
    );
  }

  function pageAction() {
    if (active === "Leads" || active === "Overview") {
      setModal({ kind: "lead" });
      return;
    }
    if (active === "Properties") setModal({ kind: "property" });
    if (active === "Bookings") setModal({ kind: "booking" });
    if (active === "Follow-ups") setModal({ kind: "follow-up" });
    if (active === "Sales Team") setModal({ kind: "employee" });
  }

  function openSearchResult(result: SearchResult) {
    setGlobalSearchOpen(false);
    setGlobalQuery("");
    setGlobalResults([]);
    if (result.kind === "lead") {
      setActive("Leads");
      setQuery(result.title);
    } else if (result.kind === "property" || result.kind === "unit") {
      setActive("Properties");
      if (result.kind === "property") {
        setExpandedProperty(result.id);
        const property = workspace.properties.find((item) => item.id === result.id);
        setPropertySearch(property?.name ?? "");
      } else {
        setExpandedProperty(result.propertyId ?? null);
        setPropertySearch("");
        setUnitSearch(result.title.split(" · ").at(-1) ?? "");
      }
    } else {
      setActive("Bookings");
    }
  }

  const pageActionLabel =
    active === "Properties"
      ? "Add project"
      : active === "Bookings"
        ? "New booking"
        : active === "Follow-ups"
          ? "Schedule follow-up"
          : active === "Sales Team"
            ? "Add employee"
            : "Add lead";

  return (
    <div
      className="crm-shell min-h-screen bg-[#f5f4f1] text-slate-800 lg:grid"
      style={
        {
          "--sidebar-width": sidebarCollapsed ? "76px" : "264px",
        } as CSSProperties
      }
    >
      <aside
        aria-label="Primary navigation"
        className={`crm-sidebar ${mobileMenu ? "visible translate-x-0" : "invisible -translate-x-full"} fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col text-white transition-[transform,visibility] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] lg:visible lg:sticky lg:top-0 lg:h-screen lg:translate-x-0`}
      >
        <div className={`crm-brand relative flex h-[78px] shrink-0 items-center gap-3 border-b border-white/[0.08] ${sidebarCollapsed ? "px-4 lg:justify-center lg:px-0" : "px-5"}`}>
          <span className="crm-logo-mark relative grid h-10 w-10 shrink-0 place-items-center rounded-[14px] text-[#efe5d2]">
            <Building2 size={21} strokeWidth={1.8} />
          </span>
          <div className={`${sidebarCollapsed ? "lg:hidden" : ""} min-w-0`}>
            <p className="text-[16px] font-semibold tracking-[-.45px]">
              EstateFlow<span className="text-[#c5aa7a]">.</span>
            </p>
            <p className="mt-1 text-[9px] font-medium tracking-[1.45px] text-slate-400">
              PROPERTY WORKSPACE
            </p>
          </div>
          <button
            aria-label="Close navigation"
            className="ml-auto rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c5aa7a] lg:hidden"
            onClick={() => setMobileMenu(false)}
            type="button"
          >
            <X size={18} />
          </button>
          <button
            aria-controls="primary-navigation"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`crm-sidebar-toggle hidden shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c5aa7a] lg:flex ${sidebarCollapsed ? "absolute right-1 top-1 h-6 w-6" : "ml-auto h-8 w-8"}`}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            type="button"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <div className={`${sidebarCollapsed ? "px-3 pt-7 lg:px-3" : "px-4 pt-7"}`}>
          <p className={`${sidebarCollapsed ? "lg:hidden" : ""} px-3 text-[10px] font-semibold uppercase tracking-[1.8px] text-slate-500`}>
            Workspace
          </p>
          <nav aria-label="Main navigation" className="mt-3 space-y-1" id="primary-navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  aria-current={active === item.name ? "page" : undefined}
                  className={`crm-nav-item group relative flex h-11 w-full items-center gap-3 rounded-xl px-3.5 text-[13px] transition-[background,color,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c5aa7a] ${sidebarCollapsed ? "lg:justify-center lg:px-0" : ""} ${active === item.name ? "is-active text-white" : "text-slate-400 hover:bg-white/[0.055] hover:text-slate-100"}`}
                  key={item.name}
                  onClick={() => {
                    setActive(item.name);
                    setMobileMenu(false);
                  }}
                  title={sidebarCollapsed ? item.name : undefined}
                  type="button"
                >
                  <Icon className="shrink-0" size={18} strokeWidth={1.7} />
                  <span className={`${sidebarCollapsed ? "lg:hidden" : ""} flex-1 text-left font-medium`}>{item.name}</span>
                  {item.name === "Leads" && (
                    <span className={`${sidebarCollapsed ? "lg:hidden" : ""} rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-slate-300`}>
                      {workspace.leads.length}
                    </span>
                  )}
                  {item.name === "Follow-ups" && dueFollowUps.length > 0 && (
                    <span className={`${sidebarCollapsed ? "lg:hidden" : ""} rounded-md bg-[#c5aa7a]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#dbc69e]`}>
                      {dueFollowUps.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className={`mt-auto ${sidebarCollapsed ? "p-3" : "p-4"}`}>
          <div className={`${sidebarCollapsed ? "lg:hidden" : ""} rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-4`}>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <CalendarDays size={15} className="text-[#c5aa7a]" />
              Today’s focus
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">
              {dueFollowUps.length
                ? `${dueFollowUps.length} follow-up${dueFollowUps.length === 1 ? "" : "s"} need your attention.`
                : "Your reminders are up to date. Keep the pipeline moving."}
            </p>
            <button
              className="mt-3 text-[11px] font-semibold text-[#d3bd92] transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c5aa7a]"
              onClick={() => {
                setActive("Follow-ups");
                setMobileMenu(false);
              }}
              type="button"
            >
              Open schedule <ArrowRight className="ml-1 inline" size={12} />
            </button>
          </div>
          <div className={`flex items-center gap-3 border-t border-white/[0.08] ${sidebarCollapsed ? "mt-3 justify-center pt-3 lg:border-t-0 lg:pt-0" : "mt-4 pt-4"}`}>
            <div
              className="crm-avatar grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
              title={`${user.name} · ${user.role === "ADMIN" ? "Workspace administrator" : "Sales employee"}`}
            >
              {initials(user.name)}
            </div>
            <div className={`${sidebarCollapsed ? "lg:hidden" : ""} min-w-0 flex-1`}>
              <p className="truncate text-xs font-semibold">{user.name}</p>
              <p className="mt-1 truncate text-[10px] text-slate-500">
                {user.role === "ADMIN" ? "Workspace administrator" : "Sales employee"}
              </p>
            </div>
            <button
              aria-label="Sign out"
              className={`rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c5aa7a] ${sidebarCollapsed ? "lg:hidden" : ""}`}
              onClick={() => void logout()}
              title="Sign out"
              type="button"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {mobileMenu && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-[#111817]/45 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileMenu(false)}
          type="button"
        />
      )}

      <main className="min-w-0 flex-1">
        <header className="crm-header sticky top-0 z-30 flex h-[70px] items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open navigation"
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#65796b] lg:hidden"
              onClick={() => setMobileMenu(true)}
              type="button"
            >
              <Menu size={20} />
            </button>
            <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
              <HomeIcon size={14} />
              <span>Workspace</span>
              <span>/</span>
            </div>
            <h2 className="text-sm font-bold text-slate-800">{active}</h2>
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="relative hidden md:block">
              <label className="flex h-9 w-60 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
                <Search size={15} className="text-slate-400" />
                <input
                  aria-label="Search leads, properties, units and bookings"
                  className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
                  onBlur={() => setTimeout(() => setGlobalSearchOpen(false), 150)}
                  onChange={(event) => {
                    setGlobalQuery(event.target.value);
                    if (event.target.value.trim().length < 2) {
                      setGlobalResults([]);
                    }
                    setGlobalSearchOpen(true);
                  }}
                  onFocus={() => setGlobalSearchOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setGlobalSearchOpen(false);
                    if (event.key === "Enter" && globalResults[0]) {
                      openSearchResult(globalResults[0]);
                    }
                  }}
                  placeholder="Search workspace…"
                  value={globalQuery}
                />
                <span className="text-[10px] text-slate-400">⌘K</span>
              </label>
              {globalSearchOpen && globalQuery.trim().length >= 2 && (
                <div className="absolute right-0 top-11 z-50 max-h-80 w-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  {globalResults.length ? globalResults.map((result) => (
                    <button
                      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
                      key={`${result.kind}-${result.id}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => openSearchResult(result)}
                      type="button"
                    >
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
                        {result.kind === "lead" ? <Users size={15} /> : result.kind === "property" || result.kind === "unit" ? <Building2 size={15} /> : <ShieldCheck size={15} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-800">{result.title}</span>
                        <span className="mt-1 block truncate text-[10px] capitalize text-slate-500">{result.kind} · {result.detail}</span>
                      </span>
                    </button>
                  )) : (
                    <p className="px-3 py-5 text-center text-xs text-slate-500">No matching records.</p>
                  )}
                </div>
              )}
            </div>
            <button
              aria-label="View follow-ups"
              className="relative rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"
              onClick={() => setActive("Follow-ups")}
              type="button"
            >
              <Bell size={17} />
              {dueFollowUps.length > 0 && (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </button>
            <div
              className="crm-avatar grid h-9 w-9 place-items-center rounded-full text-xs font-semibold"
              title={user.name}
            >
              {initials(user.name)}
            </div>
          </div>
        </header>

        <div className="crm-content mx-auto max-w-[1600px] space-y-7 p-4 sm:p-7 lg:p-9">
          {notice && (
            <div
              aria-live="polite"
              className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800"
              role="status"
            >
              <span>{notice}</span>
              <button
                aria-label="Dismiss notification"
                className="rounded-md p-1 hover:bg-blue-100"
                onClick={() => setNotice("")}
                type="button"
              >
                <X size={15} />
              </button>
            </div>
          )}

          <section className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                EstateFlow workspace
              </p>
              <h1 className="mt-2 text-[27px] font-bold tracking-[-1.1px] text-[#17243b] sm:text-[32px]">
                {active === "Overview" ? `Welcome back, ${user.name.split(" ")[0]}` : active}
              </h1>
              <p className="mt-1.5 text-[13px] text-slate-500">
                {active === "Overview"
                  ? "A clear view of your pipeline, reminders, and property activity."
                  : `Manage ${active.toLowerCase()} and keep the team moving.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {active === "Overview" && (
                <button
                  className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 sm:flex"
                  onClick={() => setModal({ kind: "booking" })}
                  type="button"
                >
                  <ShieldCheck size={15} /> New booking
                </button>
              )}
              {!(active === "Properties" && user.role !== "ADMIN") && (
                <PrimaryButton onClick={pageAction}>
                  <Plus size={16} /> {pageActionLabel}
                </PrimaryButton>
              )}
            </div>
          </section>

          {loadError && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-rose-800">
                  Couldn’t load workspace data
                </p>
                <p className="mt-1 text-sm text-rose-700">{loadError}</p>
              </div>
              <button
                className="rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                onClick={() => void reload()}
                type="button"
              >
                Try again
              </button>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              Syncing the latest workspace data…
            </div>
          )}

          {active === "Overview" && (
            <div className="space-y-6">
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                {[
                  {
                    label: "Total leads",
                    value: workspace.dashboard.counts.leadCount,
                    note: "Across your workspace",
                    icon: Users,
                    tint: "bg-blue-50 text-blue-600",
                  },
                  {
                    label: "New leads",
                    value: workspace.dashboard.counts.newLeadCount,
                    note: "Awaiting first contact",
                    icon: ArrowUpRight,
                    tint: "bg-violet-50 text-violet-600",
                  },
                  {
                    label: "Active bookings",
                    value: workspace.dashboard.activeBookingCount,
                    note: "Pending or confirmed",
                    icon: ShieldCheck,
                    tint: "bg-emerald-50 text-emerald-700",
                  },
                  {
                    label: "Booked value",
                    value: money(workspace.dashboard.activeBookingValue),
                    note: "Active booking value",
                    icon: CircleDollarSign,
                    tint: "bg-amber-50 text-amber-700",
                  },
                ].map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <article
                      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(20,40,80,0.025)]"
                      key={metric.label}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-[12px] font-medium text-slate-500">
                          {metric.label}
                        </span>
                        <span className={`grid h-10 w-10 place-items-center rounded-xl ${metric.tint}`}>
                          <Icon size={19} />
                        </span>
                      </div>
                      <p className="mt-4 text-[29px] font-bold tracking-[-1px] text-[#17243b]">
                        {metric.value}
                      </p>
                      <p className="mt-2 text-[11px] text-slate-400">{metric.note}</p>
                    </article>
                  );
                })}
              </section>

              <section className="grid grid-cols-1 gap-5 2xl:grid-cols-3">
                <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 2xl:col-span-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[15px] font-bold text-[#17243b]">
                        Pipeline overview
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Live lead distribution by stage
                      </p>
                    </div>
                    <button
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600"
                      onClick={() => setActive("Leads")}
                      type="button"
                    >
                      View pipeline <ArrowRight size={13} />
                    </button>
                  </div>
                  <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {LEAD_STAGES.slice(0, 4).map((stage) => {
                      const count = workspace.leads.filter(
                        (lead) => lead.status === stage.value,
                      ).length;
                      const percentage = workspace.leads.length
                        ? Math.round((count / workspace.leads.length) * 100)
                        : 0;
                      return (
                        <div
                          className="rounded-2xl bg-slate-50 p-4"
                          key={stage.value}
                        >
                          <p className="text-xs font-medium text-slate-500">
                            {stage.label}
                          </p>
                          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-800">
                            {count}
                          </p>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-blue-600"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <p className="mt-2 text-[10px] text-slate-400">
                            {percentage}% of leads
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {LEAD_STAGES.slice(4).map((stage) => (
                      <div
                        className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3"
                        key={stage.value}
                      >
                        <span className="text-xs text-slate-500">{stage.label}</span>
                        <span className="text-sm font-bold text-slate-800">
                          {
                            workspace.leads.filter(
                              (lead) => lead.status === stage.value,
                            ).length
                          }
                        </span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-[15px] font-bold text-[#17243b]">
                        Next follow-ups
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Your next customer touchpoints
                      </p>
                    </div>
                    <CalendarDays size={17} className="text-slate-400" />
                  </div>
                  <div className="mt-5 space-y-4">
                    {workspace.followUps
                      .filter((followUp) => !followUp.completed)
                      .slice(0, 4)
                      .map((followUp) => (
                        <div className="flex items-start gap-3" key={followUp.id}>
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-[10px] font-bold text-blue-700">
                            {initials(followUp.lead.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-800">
                              {followUp.lead.name}
                            </p>
                            <p className="mt-1 truncate text-[11px] text-slate-500">
                              {followUp.notes}
                            </p>
                            <p className={`mt-2 flex items-center gap-1 text-[10px] ${isDue(followUp) ? "font-semibold text-amber-700" : "text-slate-400"}`}>
                              <Clock3 size={11} /> {dateTimeLabel(followUp.scheduledAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    {!workspace.followUps.some((followUp) => !followUp.completed) && (
                      <p className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
                        No reminders scheduled. Add a follow-up to keep a lead
                        from going quiet.
                      </p>
                    )}
                  </div>
                  <button
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={() => setActive("Follow-ups")}
                    type="button"
                  >
                    Open schedule <ArrowRight size={13} />
                  </button>
                </article>
              </section>

              <section className="grid grid-cols-1 gap-5 2xl:grid-cols-3">
                <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 2xl:col-span-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[15px] font-bold text-[#17243b]">Booking value</h3>
                      <p className="mt-1 text-[11px] text-slate-400">Active booking value by month · database records</p>
                    </div>
                    <CircleDollarSign className="text-emerald-600" size={18} />
                  </div>
                  {workspace.dashboard.monthlyRevenue.length ? (
                    <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
                      {workspace.dashboard.monthlyRevenue.map((month) => {
                        const maxValue = Math.max(...workspace.dashboard.monthlyRevenue.map((item) => item.amount));
                        const ratio = maxValue ? Math.max(6, (month.amount / maxValue) * 100) : 0;
                        const label = new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(`${month.month}-01T00:00:00`));
                        return (
                          <div className="flex min-w-0 flex-col items-center" key={month.month}>
                            <span className="mb-2 truncate text-[10px] font-medium text-slate-500">{money(month.amount)}</span>
                            <div className="flex h-28 w-full items-end rounded-lg bg-slate-50 p-1.5">
                              <div className="w-full rounded-md bg-blue-500" style={{ height: `${ratio}%` }} title={`${label}: ${money(month.amount)}`} />
                            </div>
                            <span className="mt-2 text-[10px] text-slate-400">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                      Booking value will appear here when active bookings are recorded.
                    </p>
                  )}
                  <p className="mt-4 text-[10px] text-slate-400">
                    Pending and confirmed bookings only; cancelled bookings are excluded.
                  </p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-[15px] font-bold text-[#17243b]">Recent bookings</h3>
                      <p className="mt-1 text-[11px] text-slate-400">Latest unit reservations</p>
                    </div>
                    <ShieldCheck className="text-emerald-600" size={18} />
                  </div>
                  <div className="mt-5 space-y-4">
                    {workspace.dashboard.recentBookings.slice(0, 4).map((booking) => (
                      <div className="flex items-start gap-3" key={booking.id}>
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Building2 size={16} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-800">{booking.lead.name}</p>
                          <p className="mt-1 truncate text-[10px] text-slate-500">{booking.unit.building.property.name} · {booking.unit.unitNumber}</p>
                        </div>
                        <span className="whitespace-nowrap text-[10px] font-semibold text-slate-600">{money(booking.amount)}</span>
                      </div>
                    ))}
                    {!workspace.dashboard.recentBookings.length && (
                      <p className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">No bookings yet. Available units can be reserved from the Bookings page.</p>
                    )}
                  </div>
                  <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setActive("Bookings")} type="button">
                    View bookings <ArrowRight size={13} />
                  </button>
                </article>
              </section>

              <section className="grid grid-cols-1 gap-5 2xl:grid-cols-3">
                <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm 2xl:col-span-2">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
                    <div>
                      <h3 className="text-[15px] font-bold text-[#17243b]">
                        Recent leads
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Recently updated customer conversations
                      </p>
                    </div>
                    <button
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600"
                      onClick={() => setActive("Leads")}
                      type="button"
                    >
                      All leads <ArrowRight size={13} />
                    </button>
                  </div>
                  {workspace.leads.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left">
                        <thead className="bg-slate-50/80 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
                          <tr>
                            <th className="px-5 py-3.5">Customer</th>
                            <th className="px-4 py-3.5">Project</th>
                            <th className="px-4 py-3.5">Budget</th>
                            <th className="px-4 py-3.5">Stage</th>
                            <th className="px-4 py-3.5">Owner</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {workspace.leads.slice(0, 5).map((lead) => (
                            <tr className="hover:bg-slate-50/70" key={lead.id}>
                              <td className="whitespace-nowrap px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-[10px] font-bold text-blue-700">
                                    {initials(lead.name)}
                                  </span>
                                  <div>
                                    <p className="text-xs font-semibold text-slate-800">
                                      {lead.name}
                                    </p>
                                    <p className="mt-1 text-[10px] text-slate-400">
                                      {lead.phone}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                                {lead.propertyName || "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold text-slate-700">
                                {money(lead.budget)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-4">
                                <StageBadge status={lead.status} />
                              </td>
                              <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">
                                {lead.assignedTo?.name ?? "Unassigned"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Users}
                      message="Create your first customer lead and start building a clear, actionable pipeline."
                      title="No leads yet"
                    />
                  )}
                </article>

                <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-[15px] font-bold text-[#17243b]">
                        Portfolio snapshot
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Current unit inventory
                      </p>
                    </div>
                    <Building2 size={17} className="text-slate-400" />
                  </div>
                  <div className="mt-6 flex items-end justify-between">
                    <div>
                      <p className="text-3xl font-bold tracking-tight text-[#17243b]">
                        {workspace.properties.length}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Projects</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold tracking-tight text-emerald-700">
                        {workspace.properties.reduce(
                          (total, property) =>
                            total +
                            property.buildings.reduce(
                              (buildingTotal, building) =>
                                buildingTotal +
                                building.units.filter(
                                  (unit) => unit.status === "AVAILABLE",
                                ).length,
                              0,
                            ),
                          0,
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Available units</p>
                    </div>
                  </div>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: `${activeUnitCount ? Math.round((workspace.properties.reduce((total, property) => total + property.buildings.reduce((buildingTotal, building) => buildingTotal + building.units.filter((unit) => unit.status === "AVAILABLE").length, 0), 0) / activeUnitCount) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">
                    {activeUnitCount} total units across the portfolio
                  </p>
                  <button
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={() => setActive("Properties")}
                    type="button"
                  >
                    View properties <ArrowRight size={13} />
                  </button>
                </article>
              </section>
            </div>
          )}

          {active === "Leads" && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
                <div>
                  <h3 className="text-[15px] font-bold">Lead management</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {filteredLeads.length} of {workspace.leads.length} leads
                  </p>
                </div>
                <PrimaryButton onClick={() => setModal({ kind: "lead" })}>
                  <Plus size={15} /> New lead
                </PrimaryButton>
              </div>
              <div className="flex flex-wrap gap-3 p-5">
                <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                  <Search size={15} className="text-slate-400" />
                  <input
                    aria-label="Search leads by customer, phone or project"
                    className="w-full text-sm outline-none placeholder:text-slate-400"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search name, phone, email, project…"
                    value={query}
                  />
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5">
                  <span className="text-xs font-medium text-slate-500">Stage</span>
                  <select
                    aria-label="Filter leads by stage"
                    className="bg-white text-sm font-medium outline-none"
                    onChange={(event) => setStageFilter(event.target.value)}
                    value={stageFilter}
                  >
                    <option value="ALL">All stages</option>
                    {LEAD_STAGES.map((stage) => (
                      <option key={stage.value} value={stage.value}>
                        {stage.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {filteredLeads.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] text-left">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
                      <tr>
                        <th className="px-5 py-4">Customer</th>
                        <th className="px-4 py-4">Project / budget</th>
                        <th className="px-4 py-4">Owner</th>
                        <th className="px-4 py-4">Added</th>
                        <th className="px-4 py-4">Stage</th>
                        <th className="px-4 py-4">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLeads.map((lead) => (
                        <tr className="hover:bg-slate-50/70" key={lead.id}>
                          <td className="whitespace-nowrap px-5 py-4">
                            <div className="flex items-center gap-3">
                              <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-[10px] font-bold text-blue-700">
                                {initials(lead.name)}
                              </span>
                              <div>
                                <p className="text-xs font-semibold text-slate-800">
                                  {lead.name}
                                </p>
                                <p className="mt-1 text-[10px] text-slate-400">
                                  {lead.email || lead.phone}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-xs text-slate-700">
                              {lead.propertyName || "Not specified"}
                            </p>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {money(lead.budget)}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">
                            {lead.assignedTo?.name ?? "Unassigned"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">
                            {dateLabel(lead.createdAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <select
                              aria-label={`Update ${lead.name} stage`}
                              className="max-w-40 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium"
                              disabled={saving}
                              onChange={(event) =>
                                void changeLeadStatus(lead.id, event.target.value)
                              }
                              value={lead.status}
                            >
                              {LEAD_STAGES.map((stage) => (
                                <option key={stage.value} value={stage.value}>
                                  {stage.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <div className="flex items-center gap-1">
                              <button
                                aria-label={`Edit ${lead.name}`}
                                className="rounded-lg px-2.5 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                                onClick={() => setModal({ kind: "lead", lead })}
                                type="button"
                              >
                                Edit
                              </button>
                              <button
                                aria-label={`Schedule follow-up for ${lead.name}`}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                                onClick={() =>
                                  setModal({ kind: "follow-up", leadId: lead.id })
                                }
                                title="Schedule a follow-up"
                                type="button"
                              >
                                <CalendarDays size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={query || stageFilter !== "ALL" ? Search : Users}
                  message={
                    query || stageFilter !== "ALL"
                      ? "Try another name, project, or stage filter."
                      : "Add your first customer to start tracking conversations and next steps."
                  }
                  title={
                    query || stageFilter !== "ALL"
                      ? "No leads match these filters"
                      : "Your pipeline starts here"
                  }
                  action={
                    !query && stageFilter === "ALL" ? (
                      <PrimaryButton onClick={() => setModal({ kind: "lead" })}>
                        <Plus size={15} /> Add lead
                      </PrimaryButton>
                    ) : undefined
                  }
                />
              )}
            </section>
          )}

          {active === "Properties" && (
            <section className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Building2 size={16} />
                  {workspace.properties.length} projects · {activeUnitCount} units
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="flex min-w-[200px] items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5">
                  <Search size={15} className="text-slate-400" />
                  <input
                    aria-label="Search properties"
                    className="w-full text-sm outline-none"
                    onChange={(event) => setPropertySearch(event.target.value)}
                    placeholder="Search projects…"
                    value={propertySearch}
                  />
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5">
                    <span className="text-xs font-medium text-slate-500">Unit status</span>
                    <select className="bg-white text-sm outline-none" onChange={(event) => setUnitStatusFilter(event.target.value)} value={unitStatusFilter}>
                      <option value="ALL">All</option>
                      <option value="AVAILABLE">Available</option>
                      <option value="BLOCKED">Blocked</option>
                      <option value="BOOKED">Booked</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5">
                    <Search size={14} className="text-slate-400" />
                    <input className="w-36 text-sm outline-none" onChange={(event) => setUnitSearch(event.target.value)} placeholder="Search units…" value={unitSearch} />
                  </label>
                </div>
              </div>
              {filteredProperties.length ? (
                <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                  {filteredProperties.map((property) => {
                    const units = property.buildings.flatMap(
                      (building) => building.units,
                    );
                    const available = units.filter(
                      (unit) => unit.status === "AVAILABLE",
                    ).length;
                    const blocked = units.filter(
                      (unit) => unit.status === "BLOCKED",
                    ).length;
                    const expanded = expandedProperty === property.id;
                    return (
                      <article
                        className="crm-property-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                        key={property.id}
                      >
                        <div className="crm-property-heading bg-gradient-to-br from-[#1e2926] to-[#435a4e] px-6 py-7 text-white">
                          <div className="flex items-start justify-between gap-4">
                            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10">
                              <Building2 size={20} />
                            </span>
                            <span className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-blue-100">
                              {property.buildings.length}{" "}
                              {property.buildings.length === 1 ? "building" : "buildings"}
                            </span>
                          </div>
                          {user.role === "ADMIN" && (
                            <button
                              className="mt-4 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                              onClick={() => setModal({ kind: "property-edit", property })}
                              type="button"
                            >
                              Edit project
                            </button>
                          )}
                          <h3 className="mt-5 text-xl font-bold tracking-tight">
                            {property.name}
                          </h3>
                          <p className="mt-1.5 text-sm text-blue-100/75">
                            {property.location}
                          </p>
                          {property.description && (
                            <p className="mt-3 line-clamp-2 text-xs leading-5 text-blue-100/70">
                              {property.description}
                            </p>
                          )}
                        </div>
                        <div className="p-5">
                          <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-xl bg-slate-50 py-3">
                            <div className="px-3 text-center">
                              <p className="text-lg font-bold text-slate-800">
                                {units.length}
                              </p>
                              <p className="mt-1 text-[10px] text-slate-500">Total units</p>
                            </div>
                            <div className="px-3 text-center">
                              <p className="text-lg font-bold text-emerald-700">
                                {available}
                              </p>
                              <p className="mt-1 text-[10px] text-slate-500">Available</p>
                            </div>
                            <div className="px-3 text-center">
                              <p className="text-lg font-bold text-slate-800">
                                {units.filter((unit) => unit.status === "BOOKED").length}
                              </p>
                              <p className="mt-1 text-[10px] text-slate-500">Booked</p>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                            <span>{blocked} blocked units</span>
                            <span>
                              {units.length ? Math.round((available / units.length) * 100) : 0}% available
                            </span>
                          </div>
                          <button
                            aria-expanded={expanded}
                            className="mt-4 flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() =>
                              setExpandedProperty(expanded ? null : property.id)
                            }
                            type="button"
                          >
                            Browse unit inventory
                            <ChevronDown
                              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                              size={16}
                            />
                          </button>
                          {expanded && (
                            <div className="mt-4 space-y-4">
                              {property.buildings.map((building) => (
                                <div key={building.id}>
                                  <div className="mb-2 flex items-center justify-between">
                                    <h4 className="text-xs font-semibold text-slate-700">
                                      {building.name}
                                    </h4>
                                    {user.role === "ADMIN" && (
                                      <button className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50" onClick={() => setModal({ kind: "unit", propertyId: property.id, buildingId: building.id })} type="button">
                                        <Plus className="mr-1 inline" size={13} /> Add unit
                                      </button>
                                    )}
                                  </div>
                                  {building.units.some((unit) => (unitSearch === "" || `${unit.unitNumber} ${building.name} ${property.name}`.toLowerCase().includes(unitSearch.toLowerCase())) && (unitStatusFilter === "ALL" || unit.status === unitStatusFilter)) ? (
                                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                                      <table className="w-full min-w-[500px] text-left">
                                        <thead className="bg-slate-50 text-[10px] font-semibold text-slate-400">
                                          <tr>
                                            <th className="px-3 py-2.5">Unit</th>
                                            <th className="px-3 py-2.5">Type</th>
                                            <th className="px-3 py-2.5">Price</th>
                                            <th className="px-3 py-2.5">Availability</th>
                                            <th className="px-3 py-2.5">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {building.units.filter((unit) => (unitSearch === "" || `${unit.unitNumber} ${building.name} ${property.name}`.toLowerCase().includes(unitSearch.toLowerCase())) && (unitStatusFilter === "ALL" || unit.status === unitStatusFilter)).map((unit) => (
                                            <tr key={unit.id}>
                                              <td className="px-3 py-3 text-xs font-semibold text-slate-700">
                                                {unit.unitNumber}
                                                {unit.floor !== null && (
                                                  <span className="ml-1 font-normal text-slate-400">
                                                    · L{unit.floor}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-3 py-3 text-xs text-slate-500">
                                                {readableType(unit.type)}
                                              </td>
                                              <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">
                                                {money(unit.price)}
                                              </td>
                                              <td className="px-3 py-3">
                                                <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${unit.status === "AVAILABLE" ? "bg-emerald-50 text-emerald-700" : unit.status === "BOOKED" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                                                  {unit.status.toLowerCase()}
                                                </span>
                                              </td>
                                              <td className="px-3 py-3">
                                                {user.role === "ADMIN" && unit.status !== "BOOKED" ? (
                                                  <button className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50" onClick={() => setModal({ kind: "unit", propertyId: property.id, buildingId: building.id, unit })} type="button">Edit</button>
                                                ) : <span className="text-xs text-slate-400">—</span>}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-400">
                                      {building.units.length ? "No units match these filters." : "No units in this building yet."}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white">
                  <EmptyState
                    icon={Building2}
                    message={
                      propertySearch
                        ? "Try another project name or location."
                        : "Add a project with its first building and available units to start managing your inventory."
                    }
                    title={
                      propertySearch ? "No matching projects" : "No properties yet"
                    }
                    action={
                      user.role === "ADMIN" && !propertySearch ? (
                        <PrimaryButton onClick={() => setModal({ kind: "property" })}>
                          <Plus size={15} /> Add a project
                        </PrimaryButton>
                      ) : undefined
                    }
                  />
                </div>
              )}
            </section>
          )}

          {active === "Bookings" && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
                <div>
                  <h3 className="text-[15px] font-bold">Booking operations</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {workspace.dashboard.activeBookingCount} active ·{" "}
                    {workspace.dashboard.counts.pendingBookingCount} pending ·{" "}
                    {workspace.dashboard.counts.confirmedBookingCount} confirmed ·{" "}
                    {workspace.dashboard.counts.cancelledBookingCount} cancelled
                  </p>
                </div>
                <PrimaryButton onClick={() => setModal({ kind: "booking" })}>
                  <Plus size={15} /> New booking
                </PrimaryButton>
              </div>
              <div className="flex flex-wrap gap-3 border-b border-slate-100 p-5">
                <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5">
                  <Search className="text-slate-400" size={15} />
                  <input aria-label="Search bookings" className="w-full text-sm outline-none" onChange={(event) => setBookingSearch(event.target.value)} placeholder="Search customer, project, unit…" value={bookingSearch} />
                </label>
                <select aria-label="Filter bookings by status" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm" onChange={(event) => setBookingStatusFilter(event.target.value)} value={bookingStatusFilter}>
                  <option value="ALL">All statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
              {filteredBookings.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
                      <tr>
                        <th className="px-5 py-4">Customer</th>
                        <th className="px-4 py-4">Unit</th>
                        <th className="px-4 py-4">Property</th>
                        <th className="px-4 py-4">Booked by</th>
                        <th className="px-4 py-4">Amount</th>
                        <th className="px-4 py-4">Status</th>
                        <th className="px-4 py-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredBookings.map((booking) => (
                        <tr
                          className={booking.status === "CANCELLED" ? "opacity-55" : ""}
                          key={booking.id}
                        >
                          <td className="whitespace-nowrap px-5 py-4">
                            <p className="text-xs font-semibold text-slate-800">
                              {booking.lead.name}
                            </p>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {dateLabel(booking.bookedAt)}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <p className="text-xs font-semibold text-slate-700">
                              {booking.unit.unitNumber} · {readableType(booking.unit.type)}
                            </p>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {booking.unit.building.name}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <p className="text-xs text-slate-700">
                              {booking.unit.building.property.name}
                            </p>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {booking.unit.building.property.location}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">
                            {booking.user.name}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold text-slate-700">
                            {money(booking.amount)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <span className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${booking.status === "CONFIRMED" ? "bg-emerald-50 text-emerald-700" : booking.status === "CANCELLED" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>
                              {booking.status.toLowerCase()}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            {booking.status === "PENDING" ? (
                              <button
                                className="rounded-lg px-2.5 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                                onClick={() =>
                                  void changeBookingStatus(booking, "CONFIRMED")
                                }
                                type="button"
                              >
                                Confirm
                              </button>
                            ) : booking.status !== "CANCELLED" ? (
                              <button
                                className="rounded-lg px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                onClick={() =>
                                  void changeBookingStatus(booking, "CANCELLED")
                                }
                                type="button"
                              >
                                Cancel
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={ShieldCheck}
                  message={workspace.bookings.length ? "Try a different search or status filter." : "Choose an open lead and an available unit. A successful booking immediately reserves that unit for the customer."}
                  title={workspace.bookings.length ? "No bookings match these filters" : "No bookings yet"}
                  action={
                    !workspace.bookings.length ? <PrimaryButton onClick={() => setModal({ kind: "booking" })}>
                      <Plus size={15} /> Create a booking
                    </PrimaryButton> : undefined}
                />
              )}
            </section>
          )}

          {active === "Follow-ups" && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
                <div>
                  <h3 className="text-[15px] font-bold">Follow-up schedule</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {workspace.dashboard.counts.overdueFollowUpCount} overdue ·{" "}
                    {workspace.dashboard.counts.dueTodayCount} due today ·{" "}
                    {workspace.dashboard.counts.upcomingFollowUpCount} upcoming ·{" "}
                    {workspace.dashboard.counts.openFollowUpCount} open ·{" "}
                    {workspace.dashboard.counts.completedFollowUpCount} completed
                  </p>
                </div>
                <PrimaryButton onClick={() => setModal({ kind: "follow-up" })}>
                  <Plus size={15} /> Schedule follow-up
                </PrimaryButton>
              </div>
              <div className="flex flex-wrap gap-3 border-b border-slate-100 p-5">
                <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5">
                  <Search className="text-slate-400" size={15} />
                  <input aria-label="Search follow-ups" className="w-full text-sm outline-none" onChange={(event) => setFollowUpSearch(event.target.value)} placeholder="Search customer or reminder…" value={followUpSearch} />
                </label>
                <select aria-label="Filter follow-ups" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm" onChange={(event) => setFollowUpFilter(event.target.value)} value={followUpFilter}>
                  <option value="OPEN">Open</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="TODAY">Due today</option>
                  <option value="UPCOMING">Upcoming</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ALL">All</option>
                </select>
                {user.role === "ADMIN" && (
                  <select aria-label="Filter follow-ups by employee" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm" onChange={(event) => setFollowUpEmployee(event.target.value)} value={followUpEmployee}>
                    <option value="ALL">All employees</option>
                    {workspace.users.filter((member) => member.role === "SALES_EMPLOYEE").map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
                )}
              </div>
              {filteredFollowUps.length ? (
                <div className="divide-y divide-slate-100">
                  {filteredFollowUps.map((followUp) => (
                    <article
                      className={`flex flex-wrap items-center gap-4 px-5 py-4 ${followUp.completed ? "opacity-55" : ""}`}
                      key={followUp.id}
                    >
                      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold ${isDue(followUp) ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                        {initials(followUp.lead.name)}
                      </div>
                      <div className="min-w-[180px] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-800">
                            {followUp.lead.name}
                          </h4>
                          <StageBadge status={followUp.lead.status} />
                        </div>
                        <p className="mt-1.5 text-sm text-slate-500">
                          {followUp.notes}
                        </p>
                        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                          <span className={isDue(followUp) ? "font-semibold text-amber-700" : ""}>
                            {dateTimeLabel(followUp.scheduledAt)}
                          </span>
                          <span>{followUp.lead.phone}</span>
                          {user.role === "ADMIN" && followUp.user && (
                            <span>Owner: {followUp.user.name}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="rounded-lg px-2.5 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50" onClick={() => setModal({ kind: "follow-up", leadId: followUp.lead.id, followUp })} type="button">Edit</button>
                        <button
                          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${followUp.completed ? "border-slate-200 text-slate-500 hover:bg-slate-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                          onClick={() => void toggleFollowUp(followUp)}
                          type="button"
                        >
                          {followUp.completed ? <><ArrowDownRight size={14} /> Reopen</> : <><Check size={14} /> Mark done</>}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  message={workspace.followUps.length ? "Try a different search or follow-up filter." : "Schedule a reminder from a lead or create one here. Your next steps stay visible to the team."}
                  title={workspace.followUps.length ? "No reminders match these filters" : "No follow-ups scheduled"}
                  action={
                    workspace.leads.length && !workspace.followUps.length ? (
                      <PrimaryButton onClick={() => setModal({ kind: "follow-up" })}>
                        <Plus size={15} /> Add a reminder
                      </PrimaryButton>
                    ) : (
                      <button
                        className="text-sm font-semibold text-blue-600"
                        onClick={() => setActive("Leads")}
                        type="button"
                      >
                        Create a lead first <ArrowRight className="ml-1 inline" size={14} />
                      </button>
                    )
                  }
                />
              )}
            </section>
          )}

          {active === "Sales Team" && user.role === "ADMIN" && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
                <div>
                  <h3 className="text-[15px] font-bold">Sales team</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {workspace.users.length} workspace member
                    {workspace.users.length === 1 ? "" : "s"} · Admins can view all leads
                  </p>
                </div>
                <PrimaryButton onClick={() => setModal({ kind: "employee" })}>
                  <Plus size={15} /> Add employee
                </PrimaryButton>
              </div>
              <div className="flex flex-wrap gap-3 border-b border-slate-100 p-5">
                <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5">
                  <Search className="text-slate-400" size={15} />
                  <input aria-label="Search team members" className="w-full text-sm outline-none" onChange={(event) => setTeamSearch(event.target.value)} placeholder="Search name or email…" value={teamSearch} />
                </label>
                <select aria-label="Filter team by role" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm" onChange={(event) => setTeamRoleFilter(event.target.value)} value={teamRoleFilter}>
                  <option value="ALL">All roles</option>
                  <option value="ADMIN">Administrators</option>
                  <option value="SALES_EMPLOYEE">Sales employees</option>
                </select>
              </div>
              {filteredTeam.length ? (
                <div className="divide-y divide-slate-100">
                  {filteredTeam.map((member) => (
                    <article
                      className="flex flex-wrap items-center gap-4 px-5 py-4"
                      key={member.id}
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-xs font-bold text-violet-700">
                        {initials(member.name)}
                      </span>
                      <div className="min-w-[180px] flex-1">
                        <p className="text-sm font-semibold text-slate-800">
                          {member.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{member.email}</p>
                      </div>
                      <span className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${member.role === "ADMIN" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"}`}>
                        {member.role === "ADMIN" ? "Administrator" : "Sales employee"}
                      </span>
                      <span className="text-xs text-slate-500">{member.assignedLeadsCount ?? 0} assigned leads</span>
                      <span className="text-xs text-slate-500">{member.activeBookingsCount ?? 0} active bookings</span>
                      <span className="w-28 text-right text-xs text-slate-400">
                        Joined {dateLabel(member.createdAt)}
                      </span>
                      {member.role === "SALES_EMPLOYEE" && (
                        <button className="rounded-lg px-2.5 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50" onClick={() => setModal({ kind: "employee", member })} type="button">Edit</button>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Users}
                  message="Invite a sales employee to start assigning leads and managing follow-ups as a team."
                  title={workspace.users.length ? "No team members match these filters" : "Build your sales team"}
                  action={!workspace.users.length ? (
                    <PrimaryButton onClick={() => setModal({ kind: "employee" })}>
                      <Plus size={15} /> Add employee
                    </PrimaryButton>
                  ) : undefined}
                />
              )}
            </section>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-5 text-[10px] text-slate-400">
            <span>© {new Date().getFullYear()} EstateFlow · Sales workspace</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Connected to your workspace
            </span>
          </footer>
        </div>
      </main>

      {modal?.kind === "lead" && (
        <LeadDialog
          canAssign={user.role === "ADMIN"}
          lead={modal.lead}
          onClose={() => setModal(null)}
          onDelete={
            modal.lead && user.role === "ADMIN"
              ? () =>
                  saveRecord(
                    "/api/leads",
                    { id: modal.lead!.id },
                    "DELETE",
                    "Lead deleted.",
                  )
              : undefined
          }
          onSave={(body) =>
            saveRecord(
              "/api/leads",
              modal.lead ? { ...body, id: modal.lead.id } : body,
              modal.lead ? "PATCH" : "POST",
              modal.lead ? "Lead updated." : "Lead created.",
            )
          }
          users={workspace.users}
        />
      )}
      {modal?.kind === "follow-up" && (
        <FollowUpDialog
          leads={
            modal.followUp
              ? workspace.leads
              : workspace.leads.filter(
                  (lead) => !["BOOKED", "LOST"].includes(lead.status),
                )
          }
          onClose={() => setModal(null)}
          isAdmin={user.role === "ADMIN"}
          users={workspace.users}
          onSave={(body) => {
            const editing = Boolean(modal.followUp);
            return saveRecord(
              "/api/follow-ups",
              body,
              editing ? "PATCH" : "POST",
              editing ? "Follow-up updated." : "Follow-up scheduled.",
            );
          }}
          selectedLeadId={modal.leadId}
          followUp={modal.followUp}
        />
      )}
      {modal?.kind === "booking" && (
        <BookingDialog
          leads={workspace.leads}
          isAdmin={user.role === "ADMIN"}
          onClose={() => setModal(null)}
          onSave={(body) =>
            saveRecord("/api/bookings", body, "POST", "Property unit reserved.")
          }
          properties={workspace.properties}
          users={workspace.users}
        />
      )}
      {modal?.kind === "property-edit" && user.role === "ADMIN" && (
        <EditPropertyDialog
          onClose={() => setModal(null)}
          onSave={(body) =>
            saveRecord("/api/properties", body, "PATCH", "Project updated.")
          }
          property={modal.property}
        />
      )}
      {modal?.kind === "unit" && user.role === "ADMIN" && (
        <UnitDialog
          buildingId={modal.buildingId}
          onClose={() => setModal(null)}
          onDelete={
            modal.unit
              ? () =>
                  saveRecord(
                    "/api/units",
                    { id: modal.unit!.id },
                    "DELETE",
                    "Unit deleted.",
                  )
              : undefined
          }
          onSave={(body) => {
            const editing = Boolean(modal.unit);
            return saveRecord(
              "/api/units",
              body,
              editing ? "PATCH" : "POST",
              editing ? "Unit updated." : "Unit added.",
            );
          }}
          unit={modal.unit}
        />
      )}
      {modal?.kind === "property" && user.role === "ADMIN" && (
        <PropertyDialog
          onClose={() => setModal(null)}
          onSave={(body) =>
            saveRecord("/api/properties", body, "POST", "Property project created.")
          }
        />
      )}
      {modal?.kind === "employee" && user.role === "ADMIN" && (
        <EmployeeDialog
          member={modal.member}
          onClose={() => setModal(null)}
          onSave={(body) => {
            const editing = Boolean(modal.member);
            return saveRecord(
              "/api/users",
              body,
              editing ? "PATCH" : "POST",
              editing ? "Team member updated." : "Sales employee added.",
            );
          }}
        />
      )}
    </div>
  );
}
