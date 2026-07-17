import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import "./components.css";

interface DisclosureProps {
  title: string;
  detail?: string | number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function Disclosure({ title, detail, open, onToggle, children }: DisclosureProps) {
  return (
    <section className="moyu-disclosure">
      <button className="moyu-disclosure__trigger" type="button" onClick={onToggle} aria-expanded={open}>
        <ChevronDown className={open ? "is-open" : ""} size={15} aria-hidden="true" />
        <span>{title}</span>
        {detail !== undefined && <span className="moyu-disclosure__detail">{detail}</span>}
      </button>
      {open && <div className="moyu-disclosure__content">{children}</div>}
    </section>
  );
}
