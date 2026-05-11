"use client";

interface InvoicePrintActionsProps {
  backHref: string;
  printLabel?: string;
}

export function InvoicePrintActions({ backHref, printLabel = "Print invoice" }: InvoicePrintActionsProps) {
  return (
    <div className="invoice-print-actions">
      <a className="button-secondary" href={backHref}>
        Back to dispatch
      </a>
      <button className="button" type="button" onClick={() => window.print()}>
        {printLabel}
      </button>
    </div>
  );
}
