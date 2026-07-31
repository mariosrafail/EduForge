import { runtimeSchemaContract } from "../netlify/functions/_runtime-schema-contract.js";

export function runtimeReadySql(delegate) {
  const wrapped = async (strings, ...values) => {
    const query = strings.join(" ");
    if (query.includes("to_regclass") && query.includes("eduforge_migration_history")) {
      return [{ history_exists: true }];
    }
    if (query.includes("from eduforge_migration_history")) {
      return runtimeSchemaContract.expectedMigrations.map(({ filename, compatibleChecksums }) => ({
        filename,
        checksum_sha256: compatibleChecksums[0],
      }));
    }
    if (query.includes("information_schema.columns")) {
      return runtimeSchemaContract.requiredTables.flatMap(({ table, columns }) =>
        columns.map((column_name) => ({ table_name: table, column_name })));
    }
    return delegate(strings, ...values);
  };
  return Object.assign(wrapped, delegate);
}
