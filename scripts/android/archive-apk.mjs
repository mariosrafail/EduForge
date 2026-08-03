import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const product = process.argv[2];
if (!['student', 'teacher'].includes(product)) throw new Error("Product must be student or teacher");

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const source = path.join(repositoryRoot, "android/app/build/outputs/apk/debug/app-debug.apk");
const filename = `hamilton-house-lms-${product}-debug.apk`;
const destinationDirectory = path.join(repositoryRoot, "android/app/build/outputs/apk", product);
const destination = path.join(destinationDirectory, filename);

const apk = await stat(source);
if (!apk.isFile() || apk.size === 0) throw new Error("Gradle debug APK is missing or empty");
await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);
console.log(JSON.stringify({ product, filename, relativePath: path.relative(repositoryRoot, destination).replaceAll("\\", "/"), bytes: apk.size }, null, 2));
