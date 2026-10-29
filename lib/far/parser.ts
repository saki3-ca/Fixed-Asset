import * as XLSX from 'xlsx';
import { AssetMethod } from '@/types/database';

export interface ParsedAssetRecord {
  tag_no: string; // Saved as text, keeping leading zeros
  description: string;
  asset_class: string;
  gl_account: string;
  capitalized_on: string | null;
  cost: number;
  acc_dep: number;
  nbv: number;
  far_qty: number;
  method: AssetMethod;
}

export interface ZeroCostAssetRecord {
  tag_no: string;
  description: string;
  asset_class: string;
  gl_account: string;
  capitalized_on: string | null;
  cost: number;
  method: AssetMethod;
}

export interface FARParseResult {
  allAssets: ParsedAssetRecord[];
  activeAssets: ParsedAssetRecord[]; // All assets to be imported (including zero-cost)
  zeroCostAssets: ZeroCostAssetRecord[];
  summary: {
    totalRowsInFile: number;
    totalUniqueAssets: number;
    withValueCount: number;
    zeroCostCount: number;
    activeCount: number;
    totalCost: number;
    totalAccDep: number;
    totalNbv: number;
    byMethod: Record<AssetMethod, number>;
  };
}

// Rule 4: Method assignment from Account Determ.
export function determineMethod(accountDeterm: string): AssetMethod {
  const norm = (accountDeterm || '')
    .toLowerCase()
    .replace(/[,\-_&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Inspect
  if (norm.includes('building and shed') || norm.includes('decoration and renovation')) {
    return 'Inspect';
  }

  // Vehicle
  if (norm.includes('car and vehicle') || norm.includes('vehicle')) {
    return 'Vehicle';
  }

  // Count
  if (
    norm.includes('it hardware') ||
    norm.includes('furniture and fixture') ||
    norm.includes('office equipment') ||
    norm.includes('mould') ||
    norm.includes('plant machinery') ||
    norm.includes('construction machinery') ||
    norm.includes('factory apparatus') ||
    norm.includes('loose tools') ||
    norm.includes('lab equipment')
  ) {
    return 'Count';
  }

  // Document (AUC, Land, Clearing, etc.)
  return 'Document';
}

// Rule 6: Quantity extraction: number before pcs/pc/nos/set/sets/units in description, else 1
export function extractFARQuantity(description: string): number {
  if (!description) return 1;
  const match = description.match(/(\d+(?:\.\d+)?)\s*(?:pcs|pc|nos|no|set|sets|units|unit)\b/i);
  if (match && match[1]) {
    const parsed = parseFloat(match[1]);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 1;
}

// Format Excel date to YYYY-MM-DD
function formatExcelDate(rawDate: unknown): string | null {
  if (!rawDate) return null;
  if (rawDate instanceof Date) {
    if (isNaN(rawDate.getTime())) return null;
    return rawDate.toISOString().split('T')[0];
  }
  if (typeof rawDate === 'number') {
    // Excel serial date to JS date
    const date = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  }
  if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? trimmed.slice(0, 10) : parsed.toISOString().split('T')[0];
  }
  return null;
}

export function parseFARExcelBuffer(buffer: ArrayBuffer): FARParseResult {
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
  });

  const sheetName = workbook.SheetNames.includes('Data') 
    ? 'Data' 
    : workbook.SheetNames[0];

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error('No valid sheet found in workbook.');
  }

  // Convert to 2D array of rows
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
  });

  if (rawRows.length < 3) {
    throw new Error('The Excel sheet has insufficient data rows.');
  }

  // Rule 1: Skip first row (SUBTOTAL row); Header is row 2 (index 1)
  const headerRow = rawRows[1] as string[];
  const dataRows = rawRows.slice(2) as unknown[][];

  // Identify column indices from row 2 header
  let colAccountDeterm = -1;
  let colAssetClass = -1;
  let colGLAccount = -1;
  let colGLName = -1;
  let colCapitalizedOn = -1;
  let colFixedAssetTag = -1;
  let colFixedAssetDesc = -1;
  let colAPCReportingDate = -1;
  let colAccDepReportingDate = -1;

  for (let c = 0; c < headerRow.length; c++) {
    const h = String(headerRow[c] || '').trim().toLowerCase();
    if (h.includes('account determ')) colAccountDeterm = c;
    else if (h.includes('asset class')) colAssetClass = c;
    else if (h.includes('g/l account name')) colGLName = c;
    else if (h.includes('g/l account')) colGLAccount = c;
    else if (h.includes('capitalized on')) colCapitalizedOn = c;
    else if (h === 'fixed asset' || h.startsWith('fixed asset')) {
      if (colFixedAssetTag === -1) {
        colFixedAssetTag = c; // First "Fixed Asset" column is the Tag Number
      } else if (colFixedAssetDesc === -1) {
        colFixedAssetDesc = c; // Second "Fixed Asset" column is the Description
      }
    } else if (h.includes('apc at reporting date') || h.includes('apc reporting date')) {
      colAPCReportingDate = c;
    } else if (h.includes('acc. depr. at reporting date') || h.includes('acc depr at reporting date')) {
      colAccDepReportingDate = c;
    }
  }

  // Fallback indices if headers differ slightly
  if (colAccountDeterm === -1) colAccountDeterm = 0;
  if (colAssetClass === -1) colAssetClass = 1;
  if (colGLAccount === -1) colGLAccount = 2;
  if (colGLName === -1) colGLName = 3;
  if (colCapitalizedOn === -1) colCapitalizedOn = 4;
  if (colFixedAssetTag === -1) colFixedAssetTag = 5;
  if (colFixedAssetDesc === -1) colFixedAssetDesc = 6;
  if (colAPCReportingDate === -1) colAPCReportingDate = 12;
  if (colAccDepReportingDate === -1) colAccDepReportingDate = 19;

  interface IntermediateAsset {
    tag_no: string;
    description: string;
    asset_class: string;
    account_determ: string;
    gl_account: string;
    capitalized_on: string | null;
    cost: number;
    acc_dep: number;
  }

  const assetMap = new Map<string, IntermediateAsset>();

  for (const row of dataRows) {
    if (!row || row.length === 0) continue;

    const rawTag = row[colFixedAssetTag];
    if (rawTag === undefined || rawTag === null || String(rawTag).trim() === '') {
      continue;
    }

    // Keep tag as string (preserve leading zeros)
    let tag_no = String(rawTag).trim();
    // In case Excel formatted it with decimal like 60000000.0
    if (tag_no.endsWith('.0')) {
      tag_no = tag_no.slice(0, -2);
    }

    const glName = String(row[colGLName] || '').trim();
    // Rule 2: Rows whose "G/L Account name" contains "Depreciation" are depreciation lines
    const isDepreciationLine = glName.toLowerCase().includes('depreciation');

    const apcVal = parseFloat(String(row[colAPCReportingDate] || '0').replace(/,/g, '')) || 0;
    const accDepVal = parseFloat(String(row[colAccDepReportingDate] || '0').replace(/,/g, '')) || 0;

    let existing = assetMap.get(tag_no);

    if (!existing) {
      const desc = String(row[colFixedAssetDesc] || '').trim();
      const assetClass = String(row[colAssetClass] || '').trim();
      const acctDeterm = String(row[colAccountDeterm] || '').trim();
      const glAccount = String(row[colGLAccount] || '').trim();
      const capOn = formatExcelDate(row[colCapitalizedOn]);

      existing = {
        tag_no,
        description: desc,
        asset_class: assetClass,
        account_determ: acctDeterm,
        gl_account: glAccount,
        capitalized_on: capOn,
        cost: 0,
        acc_dep: 0,
      };
      assetMap.set(tag_no, existing);
    } else {
      // If previous description was empty, fill it
      if (!existing.description && row[colFixedAssetDesc]) {
        existing.description = String(row[colFixedAssetDesc]).trim();
      }
      if (!existing.capitalized_on && row[colCapitalizedOn]) {
        existing.capitalized_on = formatExcelDate(row[colCapitalizedOn]);
      }
    }

    // Rule 3: Collapse - Sum cost and acc_dep across matching lines
    if (isDepreciationLine) {
      existing.acc_dep += accDepVal;
    } else {
      existing.cost += apcVal;
    }
  }

  const allAssets: ParsedAssetRecord[] = [];
  const zeroCostAssets: ZeroCostAssetRecord[] = [];

  let totalCost = 0;
  let totalAccDep = 0;
  let totalNbv = 0;
  let withValueCount = 0;

  const byMethod: Record<AssetMethod, number> = {
    Count: 0,
    Inspect: 0,
    Vehicle: 0,
    Document: 0,
  };

  for (const item of Array.from(assetMap.values())) {
    const method = determineMethod(item.account_determ);
    const cost = Math.round(item.cost * 100) / 100;
    const acc_dep = Math.round(item.acc_dep * 100) / 100;
    const nbv = Math.round((cost + acc_dep) * 100) / 100;
    const far_qty = extractFARQuantity(item.description);

    const assetRecord: ParsedAssetRecord = {
      tag_no: item.tag_no,
      description: item.description,
      asset_class: item.asset_class,
      gl_account: item.gl_account,
      capitalized_on: item.capitalized_on,
      cost,
      acc_dep,
      nbv,
      far_qty,
      method,
    };

    // ALL assets are imported into the register
    allAssets.push(assetRecord);
    byMethod[method] = (byMethod[method] || 0) + 1;
    totalCost += cost;
    totalAccDep += acc_dep;
    totalNbv += nbv;

    if (cost <= 0) {
      zeroCostAssets.push({
        tag_no: item.tag_no,
        description: item.description,
        asset_class: item.asset_class,
        gl_account: item.gl_account,
        capitalized_on: item.capitalized_on,
        cost,
        method,
      });
    } else {
      withValueCount++;
    }
  }

  return {
    allAssets,
    activeAssets: allAssets, // All assets to be imported (including zero-cost)
    zeroCostAssets,
    summary: {
      totalRowsInFile: dataRows.length,
      totalUniqueAssets: assetMap.size,
      withValueCount,
      zeroCostCount: zeroCostAssets.length,
      activeCount: allAssets.length,
      totalCost: Math.round(totalCost * 100) / 100,
      totalAccDep: Math.round(totalAccDep * 100) / 100,
      totalNbv: Math.round(totalNbv * 100) / 100,
      byMethod,
    },
  };
}

