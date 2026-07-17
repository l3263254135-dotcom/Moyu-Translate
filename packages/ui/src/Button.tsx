import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./components.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "quiet";
  icon?: ReactNode;
}

export function Button({ variant = "primary", icon, children, className = "", ...props }: ButtonProps) {
  return (
    <button className={`moyu-button moyu-button--${variant} ${className}`.trim()} {...props}>
      {icon}
      <span>{children}</span>
    </button>
  );
}
