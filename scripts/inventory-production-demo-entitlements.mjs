import { inventoryProductionDemoEntitlements } from "./_production-demo-entitlement-inventory.mjs";

try {
  const result = await inventoryProductionDemoEntitlements();
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(`Production demo entitlement inventory failed: ${error.message}`);
  process.exitCode = 1;
}
