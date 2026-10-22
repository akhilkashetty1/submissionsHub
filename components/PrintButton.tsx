"use client";

import { Printer } from "lucide-react";

/** Print the page, or save it as a PDF from the print dialog. */
export default function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-secondary btn-sm print:hidden">
      <Printer className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
