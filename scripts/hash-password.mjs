// Creates ADMIN_PASSWORD_HASH. Run: npm run hash-password  (the password is typed hidden, never stored)
import { randomBytes, scryptSync } from "node:crypto";
import readline from "node:readline";

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Hide what's typed
    rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : "");
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = await ask("Admin password: ");
if (password.length < 10) {
  console.error("Use at least 10 characters.");
  process.exit(1);
}
const again = await ask("Repeat password: ");
if (again !== password) {
  console.error("Passwords don't match.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
console.log(`\nADMIN_PASSWORD_HASH=scrypt.${salt.toString("base64url")}.${hash.toString("base64url")}`);
