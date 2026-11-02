/** The forms the hub can open and close (the two ride-along forms; not RoadShield). Shared by the server and the admin page. */
export const FORM_IDS = ["2w", "4w"] as const;
export type FormId = (typeof FORM_IDS)[number];

export const isFormId = (v: unknown): v is FormId => FORM_IDS.includes(v as FormId);

/** What people see while a form is closed, until an admin writes something else. */
export const DEFAULT_CLOSED = {
  title: "Submissions have ended",
  message: "Thank you for taking part. We'll be back soon, once submissions open again.",
};

/** One-tap starting points in the admin page; they only fill the boxes, nothing is saved until Save. */
export const MESSAGE_PRESETS: { label: string; title: string; message: string }[] = [
  { label: "Ended", ...DEFAULT_CLOSED },
  { label: "Back soon", title: "We'll be right back", message: "We're updating the form. Please check back soon." },
  { label: "Paused", title: "Submissions are paused", message: "Submissions are paused for now. We'll open again shortly." },
];

export const FORM_LIMITS = { title: 80, message: 400 };
