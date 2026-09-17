// Pure safety checks for the disposable verifier. Importing this module never
// runs Wrangler or touches an account, so remote cleanup can be tested locally.
const PROTECTED_NAMES = /bloomtrack|leadsthatbloom|bloomwired|412a33ad|staging|production/i;

export function assertDisposableName(name) {
  if (!name || PROTECTED_NAMES.test(name)) throw new Error(`disposable name ${name} collides with a protected name`);
}

export function protectedIdsAreDistinct(stagingId, productionId) {
  return Boolean(stagingId) && Boolean(productionId) && stagingId !== productionId;
}

export function stagingIdentityUnchanged(before, after) {
  // Table counts and other schema metadata belong to the concurrent staging
  // deploy. They cannot establish which actor wrote that database.
  return Boolean(before?.uuid) && Boolean(before?.created_at) &&
    after?.uuid === before.uuid && after?.created_at === before.created_at;
}

export function assertDisposableIdentity(info, createdId, databaseName) {
  if (!createdId || info?.uuid !== createdId || info?.name !== databaseName) {
    throw new Error(`${databaseName} resolves to ${info?.uuid}, not the id created here (${createdId}); leaving it alone`);
  }
}

export function sameDatabaseInventory(before, after) {
  // Compare the original identity fields as a set, independent of API order.
  // Mutable table counts never participated in the account inventory check.
  const canonical = (rows) => JSON.stringify(rows.map(({ uuid, name, version, created_at }) =>
    JSON.stringify({ uuid, name, version, created_at })).sort());
  return canonical(before) === canonical(after);
}

export function guardWranglerCommand(args, { configPath, mode, databaseName, stagingName }) {
  const refuse = () => { throw new Error('refusing a Wrangler command outside the disposable verifier allowlist'); };
  if (args[0] !== 'd1') refuse();
  const command = args[1];
  if (command === 'delete') {
    if (!configPath || mode !== '--remote' || JSON.stringify(args) !== JSON.stringify(['d1','delete','DB','--config',configPath,'--skip-confirmation'])) refuse();
    return;
  }
  if (command === 'execute' || command === 'migrations') {
    // Config alone is not sufficient: a named database can bypass the DB
    // binding. Accept only the operations used by this verifier, on DB.
    const prefixLength = command === 'execute' ? 3 : 4;
    if (args[prefixLength - 1] !== 'DB' ||
        (command === 'migrations' && !['apply', 'list'].includes(args[2]))) refuse();
    const options = new Map();
    for (let i = prefixLength; i < args.length; i++) {
      const flag = args[i];
      if (options.has(flag)) refuse();
      if (['--config', '--command', '--file'].includes(flag)) {
        const value = args[++i];
        if (typeof value !== 'string' || !value || value.startsWith('--')) refuse();
        options.set(flag, value);
      } else if (['--local', '--remote', '--json'].includes(flag)) {
        options.set(flag, true);
      } else refuse(); // Includes --env, alternate configs, and extra targets.
    }
    if (!configPath || options.get('--config') !== configPath ||
        !['--local', '--remote'].includes(mode) || !options.has(mode) ||
        options.has(mode === '--local' ? '--remote' : '--local')) refuse();
    const inputs = Number(options.has('--command')) + Number(options.has('--file'));
    if (inputs !== (command === 'execute' ? 1 : 0)) refuse();
    return;
  }
  if (!['list', 'info', 'create'].includes(command)) refuse();
  const named = command === 'list' ? null : args[2];
  const allowed = command === 'info' ? [databaseName, stagingName].filter(Boolean) : [databaseName];
  if (command !== 'list' && !allowed.includes(named)) refuse();
  const flags = args.slice(command === 'list' ? 2 : 3);
  if (new Set(flags).size !== flags.length ||
      flags.some((flag) => flag !== '--json' && !(command === 'delete' && flag === '--skip-confirmation'))) refuse();
}
