/** The hub's mark, identical to the browser-tab icon (app/icon.svg). */
export default function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Submissions Hub" className={className}>
      <rect width="64" height="64" rx="14" fill="#0f1115" />
      <rect x="14" y="16" width="36" height="8" rx="3" fill="#dfe22b" />
      <rect x="14" y="28" width="36" height="8" rx="3" fill="#dfe22b" opacity=".7" />
      <rect x="14" y="40" width="36" height="8" rx="3" fill="#da1f26" />
    </svg>
  );
}
