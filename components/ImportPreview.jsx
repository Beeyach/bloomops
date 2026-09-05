'use client';

function ImportStat({ label, value, accent = false, muted = false }) {
  const valueClass = accent
    ? 'text-mauve-deep'
    : muted ? 'text-charcoal-2' : 'text-charcoal';
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[13px] text-charcoal-2">{label}</dt>
      <dd className={`text-[14px] font-semibold tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}

export default function ImportPreview({ preview, onCancel, onConfirm }) {
  if (!preview) return null;
  return (
    <div className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-panel border border-line-strong shadow-card rounded-2xl p-7 max-w-md w-full shadow-card">
        <div className="text-[12px] font-semibold text-charcoal mb-2">Preview</div>
        <h3 className="font-serif text-3xl text-charcoal mb-5 leading-tight">Ready to import?</h3>
        <dl className="space-y-2.5 mb-7">
          <ImportStat label="In CSV" value={preview.total} />
          <ImportStat label="To insert" value={preview.toInsert} accent />
          <ImportStat label="Duplicates skipped" value={preview.skipped} muted />
        </dl>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-[13px] font-medium text-charcoal-2 rounded-full hover:bg-blush-soft transition">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-5 py-2 text-[13px] font-medium bg-charcoal text-paper rounded-full hover:bg-mauve-deep transition">
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
