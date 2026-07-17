import type { HTMLAttributes } from "react";
import "./components.css";

export function Badge({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`moyu-badge ${className}`.trim()} {...props} />;
}
