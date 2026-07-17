import type { SVGProps } from "react";

export function MoyuMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Moyu Translate" {...props}>
      <path
        d="M13 25 9 12l13 7c3-2 6-3 10-3s8 1 11 3l12-7-4 14c2 4 3 8 2 13-2 10-11 17-21 17S13 49 11 39c-1-5 0-10 2-14Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M22 32h.1M42 32h.1" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M28 38c2 2 6 2 8 0" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <path
        d="M21 46c5-4 17-4 22 0-5 4-17 4-22 0Zm22 0 8-5v10l-8-5Z"
        fill="var(--moyu-accent)"
        stroke="var(--moyu-accent-strong)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
