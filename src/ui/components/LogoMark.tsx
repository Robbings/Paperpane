/** The mark: a sheet of paper seen through a window frame. */
export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <rect x="0.5" y="0.5" width="21" height="21" rx="6" fill="var(--pp-accent)" />
      <path d="M7 5.5h6l3 3v8a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5v-10.5a.5.5 0 0 1 .5-.5z" fill="#fff" />
      <path d="M8.5 10.5h5 M8.5 12.75h5 M8.5 15h3" stroke="var(--pp-accent)" strokeWidth="1" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}
