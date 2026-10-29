import ExcelJS from 'exceljs';
import path from 'path';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createServerSupabaseClient>>;

// Supabase returns at most 1,000 rows per request; read every page.
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return out;
}

export function templatePath(name: string) {
  return path.join(process.cwd(), 'docs', name);
}

export async function loadTemplate(name: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath(name));
  return wb;
}

export function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  return isNaN(d.getTime()) ? null : d;
}

export async function workbookResponse(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export type { Client };
