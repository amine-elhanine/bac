# BAC data backup and restore

This is a **manual recovery procedure**, not an automated backup service. The project is not ready for real member or finance records until the BAC board assigns a backup owner and completes a restore rehearsal. Supabase’s current documentation recommends that Free-plan projects regularly export their database with the CLI; database dumps do not back up Storage file contents. See [Supabase database backups](https://supabase.com/docs/guides/platform/backups), [CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), and [Storage downloads](https://supabase.com/docs/guides/storage/management/download-objects).

## Backup

1. Use a BAC-controlled computer and an existing encrypted drive or University-approved encrypted storage. Never place a database connection string, member export, receipt, or backup in the repository, a shared public folder, or an unencrypted USB drive.
2. Install the Supabase CLI, Docker Desktop, and PostgreSQL `psql`. On Windows, use PowerShell. Log in with `supabase login`, link the production project with `supabase link --project-ref <project-ref>`, and enter the database password only at the CLI prompt. Do not put it in a script, command history, or `.env` file.
3. Create a dated folder on the encrypted destination. From the repository root, dump the project database:

   ```powershell
   $backupDir = 'E:\BAC-Encrypted\bac-backup-YYYY-MM-DD'
   New-Item -ItemType Directory -Path $backupDir
   supabase db dump --linked --file (Join-Path $backupDir 'schema.sql')
   supabase db dump --linked --role-only --file (Join-Path $backupDir 'roles.sql')
   supabase db dump --linked --data-only --use-copy --file (Join-Path $backupDir 'data.sql')
   ```

   Use a real date in the folder name and confirm every command exits successfully before treating the backup as complete. The CLI excludes Supabase-managed `auth` and `storage` schemas, so the SQL files alone are **not** a full BAC backup.
4. Export the Auth user IDs and emails from the Supabase Dashboard SQL Editor using `select id, email, email_confirmed_at from auth.users order by id;`. Save the CSV in the same encrypted backup folder. Do not export password hashes, refresh tokens, or sessions. If the project uses a sign-in provider other than email/password, document its recovery separately.
5. In **Storage → Files → `financial-receipts`**, download every private receipt while preserving its exact object path. Keep these files and a path-to-filename inventory in the encrypted folder. Do not change the bucket to public. This bucket contains receipt files; a database dump only preserves their `receipt_path` references.
6. Save a copy of the matching repository revision and all migration files with the backup. Keep Edge Function secrets in the BAC password manager or other approved secret store; do not put secret values in the backup folder.
7. Record the backup date, operator, project reference, completion of each database/Auth/receipt step, and total file counts. Do not record passwords or secret values in this log.

## Restore rehearsal or recovery

Restore into a **new, empty Supabase project** first. Never experiment against the live project. A Free plan has a limited project allowance, so the board should reserve a project for an occasional restore rehearsal or use an existing University-approved PostgreSQL environment at no charge.

1. Create a fresh target project and keep sign-up disabled. Configure its database connection and Storage bucket through the matching checked-in migrations. Apply the repository migrations in filename order with `supabase link --project-ref <target-project-ref>` and `supabase db push`.
2. Re-create the exported Auth identities before importing `public.member_profiles`, because those profile IDs reference `auth.users`. In a trusted server-only script using the Supabase Auth Admin API, create each user with the saved UUID and email, mark the email confirmed only when the export says it was confirmed, and assign a new temporary password. Never reuse an old password or restore an old session. Require each user to set a personal password through an approved recovery process. The Auth Admin API must use a secret key on the trusted machine only; never put it in the app or browser. Supabase documents custom user IDs in its [Auth migration guidance](https://supabase.com/kb/guides/migrate-from-auth0).
3. Restore the SQL data dump into the already-migrated target (do not replay `schema.sql` over the migrated schema):

   ```powershell
   psql --single-transaction --set ON_ERROR_STOP=1 `
     --command "SET session_replication_role = replica" `
     --file (Join-Path $backupDir 'data.sql') `
     --dbname $targetDatabaseUrl
   ```

   Obtain the target connection string from the Supabase Dashboard. Keep it out of shell history and process logs. Stop if `psql` reports any error; do not try to patch a partly restored live project by hand.
4. Restore the receipt files into the private `financial-receipts` bucket through the Storage Dashboard, preserving the exact object paths referenced by `financial_transactions.receipt_path`. Confirm the bucket remains private and its RLS policies came from the migrations.
5. Re-deploy Edge Functions and configure their secrets from the approved secret store. Reconfigure Auth redirect URLs, email delivery, and Storage settings in the target Dashboard; these project-level settings are not database data.
6. Verify member counts, role assignments, attendance records, event contributions, ledger totals, reversal links, point balances, and inventory quantities against the backup manifest. Sign in with separate member, HR, and Treasurer test accounts; verify row-level access and open a restored receipt through the app. Delete temporary test accounts and project only after the board confirms the rehearsal results.

## Recovery limitations

- A CLI database dump does not include Supabase Auth users, Storage objects, active sessions, or Dashboard configuration. The procedure separately recreates identities with new credentials and manually copies receipts.
- This has not been rehearsed against a deployed BAC project. Until a full restore succeeds, keep paper records for each gathering and do not treat the free cloud project as the sole authoritative finance record.
- Supabase Free quotas, CLI syntax, and provider terms may change. Check the linked official documentation before a recovery, and do not enable paid billing to finish one.
