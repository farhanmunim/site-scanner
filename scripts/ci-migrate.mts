// CI check: two runners migrating the same empty database at once must both succeed.
import { runMigrations } from '../packages/db/src/index.ts';

await Promise.all([runMigrations(), runMigrations()]);
await runMigrations(); // and a re-run is a no-op
console.log('migrations ok');
