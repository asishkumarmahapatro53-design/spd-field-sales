"use client";

interface InvoicePrintActionsProps {
  backHref: string;
}

export function InvoicePrintActions({ backHref }: InvoicePrintActionsProps) {
  return (
    <div className="invoice-print-actions">
      <a className="button-secondary" href={backHref}>
        Back to dispatch
      </a>
      <button className="button" type="button" onClick={() => window.print()}>
        Print invoice
      </button>
    </div>
  );
}
