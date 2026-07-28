// One-off helper to generate an ADMIN_PASSWORD_HASH for the admin dashboard.
//
// Usage:
//   npm run admin:hash -- "your-strong-password"
//   npm run admin:hash                # prompts (hidden input) if omitted
//
// Copy the printed line into backend/.env. The plaintext password is never
// stored — only this scrypt hash.

import { hashPassword } from '../src/lib/auth';
import { createInterface } from 'readline';

async function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Mute echo so the password isn't shown as it's typed.
  const output = rl as unknown as { output: NodeJS.WriteStream; _writeToOutput: (s: string) => void };
  output._writeToOutput = () => output.output.write('');
  process.stdout.write(question);
  return new Promise((resolve) => {
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  let password = process.argv[2];
  if (!password) {
    password = await promptHidden('Enter admin password: ');
  }
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const hash = hashPassword(password);
  console.log('\nAdd this line to backend/.env:\n');
  console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
  console.log('\nAlso set a random SESSION_SECRET, e.g.:');
  console.log(`SESSION_SECRET="${require('crypto').randomBytes(32).toString('hex')}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
