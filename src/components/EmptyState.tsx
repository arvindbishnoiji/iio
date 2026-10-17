import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, PlusCircle } from 'lucide-react';
import { useApp } from '../app/AppContext';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  adminGuidance: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  adminGuidance,
  actionLabel,
  onAction,
}) => {
  const { isAdmin } = useApp();

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm sm:p-8">
      {icon && (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900 sm:text-lg">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">{description}</p>

      <div className="mx-auto mt-4 max-w-lg rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs text-slate-600">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
          <span>How to add this content from the Admin Panel:</span>
        </div>
        <p className="mt-1 leading-relaxed">{adminGuidance}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
          >
            {actionLabel}
          </button>
        )}
        {isAdmin && (
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Open Admin Panel (/admin)</span>
          </Link>
        )}
      </div>
    </div>
  );
};
