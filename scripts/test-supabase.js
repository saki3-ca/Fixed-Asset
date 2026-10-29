const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 1. Read .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local file not found.');
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
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\n--- Supabase Diagnostic Test ---');
console.log('Project URL:', url);
console.log('Anon Key Present:', !!anonKey && anonKey.startsWith('sb_'));
console.log('Service Role Key Present:', !!serviceKey && serviceKey.startsWith('sb_'));

if (!url || url.includes('placeholder')) {
  console.log('\n⚠️ STATUS: NOT READY');
  console.log('Reason: NEXT_PUBLIC_SUPABASE_URL is still set to the placeholder URL:');
  console.log('👉', url);
  console.log('\nPlease update line 3 in .env.local with your real Project URL from the Supabase Dashboard:');
  console.log('   Go to: Supabase Dashboard -> Project Settings -> API -> Project URL');
  console.log('   Example: https://abcdefghijklm.supabase.co\n');
  process.exit(0);
}

// 2. Test Connection with Service Role Key
async function runTest() {
  try {
    const supabase = createClient(url, serviceKey || anonKey, {
      auth: { persistSession: false },
    });

    console.log('\nTesting connection to Supabase...');
    
    // Check tables
    const tables = ['profiles', 'asset', 'location', 'verification', 'found_not_in_far', 'movement', 'audit_log'];
    const results = {};

    for (const t of tables) {
      const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
      if (error) {
        results[t] = `❌ Error: ${error.message}`;
      } else {
        results[t] = `✅ Table exists (${count || 0} rows)`;
      }
    }

    console.log('\nTable Status:');
    for (const [t, status] of Object.entries(results)) {
      console.log(`- ${t.padEnd(18)}: ${status}`);
    }

    // Check Storage
    const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
    if (bErr) {
      console.log(`\nStorage Status: ❌ ${bErr.message}`);
    } else {
      const hasEvidence = buckets.some((b) => b.id === 'evidence');
      console.log(`\nStorage Status: ${hasEvidence ? '✅ "evidence" bucket is active' : '⚠️ "evidence" bucket not found'}`);
    }

    console.log('\n--- Test Complete ---\n');
  } catch (err) {
    console.error('❌ Connection Failed:', err.message);
  }
}

runTest();

