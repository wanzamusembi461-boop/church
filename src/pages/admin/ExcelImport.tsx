import { useEffect, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/components/ui/Toast';
import { LoadingState, EmptyState } from '@/components/ui/Loading';
import { normalizeKenyanPhone } from '@/lib/utils';
import { FileSpreadsheet, Upload, CheckCircle2, XCircle, AlertTriangle, Download } from 'lucide-react';

interface ParsedRow {
  rowNumber: number;
  full_name: string;
  phone_number: string;
  normalizedPhone: string | null;
  status: 'valid' | 'invalid_name' | 'invalid_phone' | 'duplicate_in_file' | 'duplicate_existing';
  error: string | null;
}

interface ImportResults {
  created: number;
  skipped: number;
  failed: number;
  duplicates: number;
  errors: { row: number; name: string; phone: string; error: string }[];
}

export function ExcelImport() {
  const { toast } = useToast();
  const [stage, setStage] = useState<'upload' | 'preview' | 'importing' | 'results'>('upload');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (data.length < 2) {
        toast('The file has no data rows', 'warning');
        setLoading(false);
        return;
      }

      // Detect columns from header
      const header = (data[0] || []).map((h: any) => String(h || '').toLowerCase().trim());
      let nameIdx = header.findIndex((h) => h.includes('name') || h.includes('full'));
      let phoneIdx = header.findIndex((h) => h.includes('phone') || h.includes('mobile') || h.includes('number'));
      if (nameIdx === -1) nameIdx = 0;
      if (phoneIdx === -1) phoneIdx = 1;

      const phoneSet = new Map<string, number>();
      const parsed: ParsedRow[] = [];

      for (let i = 1; i < data.length; i++) {
        const rawName = String(data[i]?.[nameIdx] || '').trim();
        const rawPhone = String(data[i]?.[phoneIdx] || '').trim();
        if (!rawName && !rawPhone) continue;

        const normalized = normalizeKenyanPhone(rawPhone);
        let status: ParsedRow['status'] = 'valid';
        let error: string | null = null;

        if (!rawName || rawName.length < 2) { status = 'invalid_name'; error = 'Missing or too short name'; }
        else if (!normalized) { status = 'invalid_phone'; error = 'Invalid Kenyan phone number'; }
        else if (phoneSet.has(normalized)) { status = 'duplicate_in_file'; error = 'Duplicate phone number in this file'; }
        else { phoneSet.set(normalized, i); }

        parsed.push({ rowNumber: i, full_name: rawName, phone_number: rawPhone, normalizedPhone: normalized, status, error });
      }

      // Check existing members
      if (parsed.length > 0) {
        const phones = parsed.filter(p => p.normalizedPhone).map(p => p.normalizedPhone!);
        if (phones.length > 0) {
          const { data: existing } = await supabase.from('members').select('phone_number').in('phone_number', phones);
          const existingSet = new Set((existing || []).map(m => m.phone_number));
          parsed.forEach(p => {
            if (p.status === 'valid' && p.normalizedPhone && existingSet.has(p.normalizedPhone)) {
              p.status = 'duplicate_existing';
              p.error = 'Already registered in system';
            }
          });
        }
      }

      setRows(parsed);
      setStage('preview');
    } catch (err) {
      toast('Failed to read Excel file', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  async function handleImport() {
    const validRows = rows.filter(r => r.status === 'valid');
    if (validRows.length === 0) { toast('No valid rows to import', 'warning'); return; }

    setStage('importing');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/member-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          members: validRows.map(r => ({ full_name: r.full_name, phone_number: r.normalizedPhone })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setResults(data.results);
      setStage('results');
      await logAudit('member_import', 'members', undefined, `Imported ${data.results.created} members from Excel`);
      toast(`Import complete: ${data.results.created} members created`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', 'error');
      setStage('preview');
    }
  }

  function downloadErrorReport() {
    const errors = rows.filter(r => r.status !== 'valid');
    const csv = ['Row,Name,Phone,Error', ...errors.map(r => `${r.rowNumber},"${r.full_name}","${r.phone_number}","${r.error}"`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'import_errors.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setStage('upload');
    setRows([]);
    setResults(null);
    setFileName('');
  }

  const validCount = rows.filter(r => r.status === 'valid').length;
  const errorCount = rows.length - validCount;

  if (stage === 'upload') {
    return (
      <div className="max-w-2xl mx-auto">
        <div
          className="card p-8 border-2 border-dashed border-neutral-300 hover:border-primary-400 transition-colors cursor-pointer"
          onClick={() => document.getElementById('file-input')?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <div className="flex flex-col items-center text-center py-8">
            {loading ? <LoadingState message="Reading file..." /> : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mb-4">
                  <Upload className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Upload Excel File</h3>
                <p className="text-sm text-neutral-500 mb-1">Drag and drop your .xlsx or .xls file here, or click to browse</p>
                <p className="text-xs text-neutral-400">The file must contain "Full Name" and "Phone Number" columns</p>
              </>
            )}
          </div>
        </div>
        <input id="file-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

        <div className="mt-6 card p-5">
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-primary-600" /> Excel Format</h4>
          <p className="text-xs text-neutral-500 mb-3">Your spreadsheet should have these columns (header row required):</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-neutral-50"><th className="text-left px-3 py-2 font-medium">Full Name</th><th className="text-left px-3 py-2 font-medium">Phone Number</th></tr></thead>
              <tbody>
                <tr><td className="px-3 py-2">John Mwangi</td><td className="px-3 py-2">0712345678</td></tr>
                <tr><td className="px-3 py-2">Mary Wanjiru</td><td className="px-3 py-2">254712345678</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'preview') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-base font-semibold">Preview: {fileName}</h3>
            <p className="text-sm text-neutral-500">
              <span className="text-success-600 font-medium">{validCount} valid</span> ·
              <span className="text-error-600 font-medium"> {errorCount} issues</span> ·
              <span className="text-neutral-600"> {rows.length} total rows</span>
            </p>
          </div>
          <div className="flex gap-2">
            {errorCount > 0 && <button className="btn-secondary" onClick={downloadErrorReport}><Download className="w-4 h-4" /> Error Report</button>}
            <button className="btn-secondary" onClick={reset}>Cancel</button>
            <button className="btn-primary" onClick={handleImport} disabled={validCount === 0}>
              Import {validCount} Member{validCount !== 1 ? 's' : ''}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="p-4 bg-warning-50 border-b border-warning-200 rounded-t-xl">
            <p className="text-sm text-warning-800">
              <strong>You are about to create {validCount} member account{validCount !== 1 ? 's' : ''}.</strong> Each will get the default password <code className="bg-white px-1.5 py-0.5 rounded">Member2026</code> and must change it on first login.
            </p>
          </div>
          <div className="overflow-x-auto max-h-[50vh]">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">#</th>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Phone</th>
                  <th className="text-left px-4 py-3 font-medium">Normalized</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => (
                  <tr key={r.rowNumber} className={r.status !== 'valid' ? 'bg-error-50/50' : 'hover:bg-neutral-50'}>
                    <td className="px-4 py-2.5 text-neutral-400 text-xs">{r.rowNumber}</td>
                    <td className="px-4 py-2.5 font-medium text-neutral-900">{r.full_name || <span className="text-neutral-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{r.phone_number || <span className="text-neutral-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-neutral-600 text-xs">{r.normalizedPhone || <span className="text-neutral-300">—</span>}</td>
                    <td className="px-4 py-2.5">
                      {r.status === 'valid' ? (
                        <span className="inline-flex items-center gap-1 text-success-600 text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Valid</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-error-600 text-xs font-medium" title={r.error || ''}>
                          {r.status === 'duplicate_in_file' || r.status === 'duplicate_existing' ? <AlertTriangle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          {r.error}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'importing') {
    return <div className="flex flex-col items-center justify-center py-20"><LoadingState message="Importing members..." /></div>;
  }

  if (stage === 'results' && results) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-success-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-success-600" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Import Complete</h3>
          <p className="text-sm text-neutral-500 mb-6">Here's a summary of the import results:</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="card p-4"><p className="text-2xl font-semibold text-success-600">{results.created}</p><p className="text-xs text-neutral-500 mt-1">Created</p></div>
            <div className="card p-4"><p className="text-2xl font-semibold text-warning-600">{results.duplicates}</p><p className="text-xs text-neutral-500 mt-1">Duplicates</p></div>
            <div className="card p-4"><p className="text-2xl font-semibold text-error-600">{results.failed}</p><p className="text-xs text-neutral-500 mt-1">Failed</p></div>
            <div className="card p-4"><p className="text-2xl font-semibold text-neutral-600">{results.skipped}</p><p className="text-xs text-neutral-500 mt-1">Skipped</p></div>
          </div>
          {results.errors.length > 0 && (
            <div className="text-left mb-6">
              <button className="btn-secondary w-full" onClick={downloadErrorReport}><Download className="w-4 h-4" /> Download Error Report</button>
            </div>
          )}
          <button className="btn-primary w-full" onClick={reset}>Import Another File</button>
        </div>
      </div>
    );
  }

  return null;
}
