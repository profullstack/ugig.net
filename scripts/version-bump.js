#!/usr/bin/env node
/**
 * Version bump script for ugig CLI
 * Usage: node scripts/version-bump.js [patch|minor|major]
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const cliDir = resolve(rootDir, 'cli');

const bumpType = process.argv[2] || 'patch';

if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Usage: node scripts/version-bump.js [patch|minor|major]');
  process.exit(1);
}

function run(cmd, cwd = cliDir) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'inherit' });
}

try {
  // 1. Bump version in cli/package.json
  console.log(`\n📦 Bumping ${bumpType} version...\n`);
  run(`npm version ${bumpType} --no-git-tag-version`);
  
  // 2. Get new version
  const pkgPath = resolve(cliDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const newVersion = pkg.version;
  console.log(`\n✓ New version: ${newVersion}\n`);
  
  // 3. Update CLI version in src/index.ts
  const indexPath = resolve(cliDir, 'src/index.ts');
  let indexCode = readFileSync(indexPath, 'utf-8');
  indexCode = indexCode.replace(/\.version\("[^"]+"\)/, `.version("${newVersion}")`);
  writeFileSync(indexPath, indexCode);
  console.log(`✓ Updated CLI version in src/index.ts\n`);
  
  // 4. Build CLI
  console.log(`🔨 Building CLI...\n`);
  run('pnpm build');
  
  // 5. Publish to npm
  console.log(`\n📤 Publishing to npm...\n`);
  run('npm publish --access public');
  
  // 6. Commit and push
  console.log(`\n📝 Committing changes...\n`);
  run(`git add cli/package.json cli/src/index.ts`, rootDir);
  run(`git commit --no-verify -m "chore: bump ugig CLI to ${newVersion}"`, rootDir);
  run('git push', rootDir);
  
  // 7. Update local install at ~/.ugig-cli/cli
  const localCliDir = resolve(homedir(), '.ugig-cli/cli');
  console.log(`\n🔄 Updating local install at ${localCliDir}...\n`);
  run('git pull', localCliDir);
  run('pnpm install', localCliDir);
  run('pnpm build', localCliDir);
  
  console.log(`\n✅ Successfully published ugig@${newVersion}\n`);
  
} catch (err) {
  console.error('\n❌ Version bump failed:', err.message);
  process.exit(1);
}
