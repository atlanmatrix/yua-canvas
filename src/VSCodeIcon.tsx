export function VSCodeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="vscode-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M17.3 1.2 23 3.9v16.2l-5.7 2.7L6.4 13.7 2.7 16.5 1 15.7V8.3l1.7-.8 3.7 2.8L17.3 1.2Zm0 5.3L10.7 12l6.6 5.5v-11ZM2.7 10.2v3.6L5.1 12l-2.4-1.8Z" />
    </svg>
  );
}
