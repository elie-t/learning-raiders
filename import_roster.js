// import_roster.js
// Usage:
//   node import_roster.js                      # default: skip existing docs
//   node import_roster.js --update-changed     # only update if fields changed
//   node import_roster.js --upsert             # create or overwrite
//   node import_roster.js --dry-run --update-changed
//
// Files required in the same folder:
//   - serviceAccountKey.json (Firebase Admin key)
//   - students_roster.csv (columns: name,role,grade,email)

const fs = require('fs');
const Papa = require('papaparse');
const admin = require('firebase-admin');

const ARGS = process.argv.slice(2);
const MODE = ARGS.includes('--upsert')
  ? 'UPSERT'
  : ARGS.includes('--update-changed')
  ? 'UPDATE_CHANGED'
  : 'SKIP_EXISTING';
const DRY_RUN = ARGS.includes('--dry-run');

const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const CSV_PATH = './students_roster.csv';

// Normalize helpers
const normEmail = (s) => (s || '').trim().toLowerCase();
const normStr = (s) => (s || '').toString().trim();
const toDoc = (row) => {
  const email = normEmail(row.email);
  return {
    email,
    name: normStr(row.name),
    role: normStr(row.role || 'student'),
    grade: normStr(row.grade || ''),
    // You can extend with section, classId, etc.
  };
};

const shallowEqual = (a, b, keys) => {
  for (const k of keys) {
    if ((a[k] ?? '') !== (b[k] ?? '')) return false;
  }
  return true;
};

async function run() {
  // 1) Read CSV
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ Missing ${CSV_PATH}`);
    process.exit(1);
  }
  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data.map(toDoc).filter((r) => r.email);

  console.log(`\n📥 Loaded ${rows.length} rows from ${CSV_PATH}`);
  console.log(`🔧 Mode: ${MODE}${DRY_RUN ? ' (dry-run)' : ''}\n`);

  // 2) Process in chunks to respect 500 writes per batch
  const CHUNK = 450;
  let created = 0,
    updated = 0,
    skipped = 0,
    unchanged = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const batch = db.batch();

    for (const row of slice) {
      const docRef = db.collection('roster').doc(row.email);

      // Fetch existing to decide action
      /* eslint-disable no-await-in-loop */
      const snap = await docRef.get();
      if (!snap.exists) {
        // Create new
        created++;
        console.log(`➕ create ${row.email}  { role:${row.role}, grade:${row.grade} }`);
        if (!DRY_RUN) {
          batch.set(docRef, {
            ...row,
            importedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        continue;
      }

      // Existing doc
      const existing = snap.data() || {};
      if (MODE === 'SKIP_EXISTING') {
        skipped++;
        // optional: print minimal info
        // console.log(`⏭️  skip (exists) ${row.email}`);
        continue;
      }

      if (MODE === 'UPDATE_CHANGED') {
        const keys = ['name', 'role', 'grade', 'email'];
        if (shallowEqual(existing, row, keys)) {
          unchanged++;
          // console.log(`＝ no change ${row.email}`);
          continue;
        }
        updated++;
        console.log(
          `✏️  update ${row.email}  { role:${existing.role}→${row.role}, grade:${existing.grade}→${row.grade} }`
        );
        if (!DRY_RUN) {
          batch.set(
            docRef,
            {
              ...row,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
        continue;
      }

      if (MODE === 'UPSERT') {
        updated++;
        console.log(`♻️  upsert ${row.email}  { role:${row.role}, grade:${row.grade} }`);
        if (!DRY_RUN) {
          batch.set(
            docRef,
            {
              ...row,
              upsertedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      }
    }

    if (!DRY_RUN) {
      await batch.commit();
    }
  }

  console.log('\n✅ Done.');
  console.log(`   ➕ created : ${created}`);
  console.log(`   ✏️  updated : ${updated}`);
  console.log(`   ＝ unchanged: ${unchanged}`);
  console.log(`   ⏭️  skipped : ${skipped}\n`);
}

run().catch((err) => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});