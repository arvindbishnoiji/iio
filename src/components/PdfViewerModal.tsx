import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { ExternalLink, FileText, X, AlertCircle } from 'lucide-react';
import { isSafeHttpUrl } from '../lib/validation';

interface PdfViewerModalProps {
  open: boolean;
  title: string;
  pdfUrl: string | null;
  onClose: () => void;
}

export async function openSafeExternalPdf(url: string): Promise<void> {
  if (!isSafeHttpUrl(url)) {
    throw new Error('Blocked unsafe URL protocol. Only http(s) PDF links are allowed.');
  }
  const cleanUrl = url.trim();
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url: cleanUrl });
  } else {
    window.open(cleanUrl, '_blank', 'noopener,noreferrer');
  }
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  open,
  title,
  pdfUrl,
  onClose,
}) => {
  if (!open || !pdfUrl) return null;

  const isSafe = isSafeHttpUrl(pdfUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 p-2 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="h-5 w-5 shrink-0 text-indigo-600" />
            <h3 className="truncate text-base font-semibold text-slate-900">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {isSafe && (
              <button
                type="button"
                onClick={() => openSafeExternalPdf(pdfUrl)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open / Download PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close PDF viewer"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative flex-1 bg-slate-100">
          {!isSafe ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="mt-3 text-base font-semibold text-slate-900">
                Invalid or Unsafe Resource URL
              </p>
              <p className="mt-1 max-w-md text-sm text-slate-600">
                For your security, only verified HTTP/HTTPS links can be opened.
              </p>
            </div>
          ) : (
            <iframe
              src={pdfUrl.trim()}
              title={title}
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-downloads"
            />
          )}
        </div>
      </div>
    </div>
  );
};
