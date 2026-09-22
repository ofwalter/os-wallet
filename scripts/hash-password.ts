// Usage: npm run hash-password -- "my password"
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- "<password>"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log(hash);

// Next.js expands $VAR references in .env files, which mangles bcrypt hashes.
console.error(
  "\nPaste the line above as-is into Vercel. For .env.local, use the escaped form:\n" +
    `DASHBOARD_PASSWORD_HASH=${hash.replace(/\$/g, "\\$")}`,
);
