import { ReactNode, useEffect } from 'react';

type DrawerProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export default function Drawer({ title, onClose, children }: DrawerProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 p-3" role="presentation" onMouseDown={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-auto rounded-xl bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
