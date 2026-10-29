const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// 1. Read environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local not found!');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

console.log('Connecting to Supabase using Service Role Key...');
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

// Helper for Method determination
function determineMethod(accountDeterm) {
  const norm = (accountDeterm || '')
    .toLowerCase()
    .replace(/[,\-_&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (norm.includes('building and shed') || norm.includes('decoration and renovation')) {
    return 'Inspect';
  }
  if (norm.includes('car and vehicle') || norm.includes('vehicle')) {
    return 'Vehicle';
  }
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
  return 'Document';
}

// Helper for Quantity extraction
function extractFARQuantity(description) {
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

// Helper for Excel date conversion
function formatExcelDate(rawDate) {
  if (!rawDate) return null;
  if (rawDate instanceof Date) {
    if (isNaN(rawDate.getTime())) return null;
    return rawDate.toISOString().split('T')[0];
  }
  if (typeof rawDate === 'number') {
    const utcDays = Math.floor(rawDate - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    if (!isNaN(dateInfo.getTime())) {
      return dateInfo.toISOString().split('T')[0];
    }
  }
  if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const dmyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

async function run() {
  try {
    const filePath = path.join(__dirname, '..', 'docs', 'FAR (14.01.26).xlsx');
    console.log(`Reading Excel file: ${filePath}`);
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    console.log(`Total raw sheet rows: ${rawRows.length}`);

    // Row 2 is header (index 1), data starts at index 2
    const headerRow = rawRows[1] || [];
    const dataRows = rawRows.slice(2);

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
        if (colFixedAssetTag === -1) colFixedAssetTag = c;
        else if (colFixedAssetDesc === -1) colFixedAssetDesc = c;
      } else if (h.includes('apc at reporting date') || h.includes('apc reporting date')) {
        colAPCReportingDate = c;
      } else if (h.includes('acc. depr. at reporting date') || h.includes('acc depr at reporting date')) {
        colAccDepReportingDate = c;
      }
    }

    if (colAccountDeterm === -1) colAccountDeterm = 0;
    if (colAssetClass === -1) colAssetClass = 1;
    if (colGLAccount === -1) colGLAccount = 2;
    if (colGLName === -1) colGLName = 3;
    if (colCapitalizedOn === -1) colCapitalizedOn = 4;
    if (colFixedAssetTag === -1) colFixedAssetTag = 5;
    if (colFixedAssetDesc === -1) colFixedAssetDesc = 6;
    if (colAPCReportingDate === -1) colAPCReportingDate = 12;
    if (colAccDepReportingDate === -1) colAccDepReportingDate = 19;

    const assetMap = new Map();

    for (const row of dataRows) {
      if (!row || row.length === 0) continue;
      const rawTag = row[colFixedAssetTag];
      if (rawTag === undefined || rawTag === null || String(rawTag).trim() === '') continue;

      let tag_no = String(rawTag).trim();
      if (tag_no.endsWith('.0')) tag_no = tag_no.slice(0, -2);

      const glName = String(row[colGLName] || '').trim();
      const isDepreciationLine = glName.toLowerCase().includes('depreciation');
      const apcVal = parseFloat(String(row[colAPCReportingDate] || '0').replace(/,/g, '')) || 0;
      const accDepVal = parseFloat(String(row[colAccDepReportingDate] || '0').replace(/,/g, '')) || 0;

      let existing = assetMap.get(tag_no);
      if (!existing) {
        existing = {
          tag_no,
          description: String(row[colFixedAssetDesc] || '').trim(),
          asset_class: String(row[colAssetClass] || '').trim(),
          account_determ: String(row[colAccountDeterm] || '').trim(),
          gl_account: String(row[colGLAccount] || '').trim(),
          capitalized_on: formatExcelDate(row[colCapitalizedOn]),
          cost: 0,
          acc_dep: 0,
        };
        assetMap.set(tag_no, existing);
      } else {
        if (!existing.description && row[colFixedAssetDesc]) {
          existing.description = String(row[colFixedAssetDesc]).trim();
        }
        if (!existing.capitalized_on && row[colCapitalizedOn]) {
          existing.capitalized_on = formatExcelDate(row[colCapitalizedOn]);
        }
      }

      if (isDepreciationLine) {
        existing.acc_dep += accDepVal;
      } else {
        existing.cost += apcVal;
      }
    }

    console.log(`\nCollapsing complete: ${assetMap.size} unique Fixed Assets found.`);

    // 1. Ensure Engagement exists
    let engagementId;
    const { data: existingEng } = await supabase.from('engagement').select('id').limit(1).maybeSingle();
    if (existingEng) {
      engagementId = existingEng.id;
    } else {
      const { data: newEng, error: engErr } = await supabase
        .from('engagement')
        .insert({
          client_name: 'Remarks HB Limited',
          financial_year: 'FY25',
          far_cutoff_date: '2025-06-30',
          status: 'active',
        })
        .select('id')
        .single();
      if (engErr) throw engErr;
      engagementId = newEng.id;
    }

    console.log(`Using Engagement ID: ${engagementId}`);

    // 2. Prepare ALL assets (including zero cost)
    const allAssets = [];
    let withValueCount = 0;
    let zeroValueCount = 0;
    let totalCost = 0;
    let totalNbv = 0;

    for (const item of Array.from(assetMap.values())) {
      const method = determineMethod(item.account_determ);
      const cost = Math.round(item.cost * 100) / 100;
      const acc_dep = Math.round(item.acc_dep * 100) / 100;
      const nbv = Math.round((cost + acc_dep) * 100) / 100;
      const far_qty = extractFARQuantity(item.description);

      allAssets.push({
        tag_no: item.tag_no,
        engagement_id: engagementId,
        description: item.description,
        asset_class: item.asset_class,
        gl_account: item.gl_account || null,
        capitalized_on: item.capitalized_on || null,
        cost,
        acc_dep,
        nbv,
        far_qty,
        method,
      });

      totalCost += cost;
      totalNbv += nbv;

      if (cost <= 0) {
        zeroValueCount++;
      } else {
        withValueCount++;
      }
    }

    console.log(`\nAssets Prepared:`);
    console.log(`- Total Unique Assets: ${allAssets.length}`);
    console.log(`- Assets with Cost > 0: ${withValueCount}`);
    console.log(`- Assets with Cost = 0: ${zeroValueCount}`);
    console.log(`- Total Cost: Tk ${(totalCost / 10000000).toFixed(2)} cr`);
    console.log(`- Total NBV: Tk ${(totalNbv / 10000000).toFixed(2)} cr`);

    // 3. Batch insert in chunks of 500
    const BATCH_SIZE = 500;
    const totalBatches = Math.ceil(allAssets.length / BATCH_SIZE);
    console.log(`\nInserting into Supabase in ${totalBatches} batches of ${BATCH_SIZE}...`);

    for (let b = 0; b < totalBatches; b++) {
      const start = b * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, allAssets.length);
      const chunk = allAssets.slice(start, end);

      const { error: upsertErr } = await supabase
        .from('asset')
        .upsert(chunk, { onConflict: 'tag_no' });

      if (upsertErr) {
        throw new Error(`Batch ${b + 1} failed: ${upsertErr.message}`);
      }
      console.log(`  ✓ Batch ${b + 1}/${totalBatches} saved (assets ${start + 1} to ${end})`);
    }

    // 4. Verification in Supabase
    const { count: finalCount, error: countErr } = await supabase
      .from('asset')
      .select('*', { count: 'exact', head: true });

    if (countErr) throw countErr;

    console.log(`\n===========================================`);
    console.log(`🎉 SUCCESS! Supabase asset table updated.`);
    console.log(`Total verified rows in Supabase 'asset': ${finalCount}`);
    console.log(`===========================================\n`);
  } catch (err) {
    console.error('❌ Error during import:', err);
    process.exit(1);
  }
}

run();
