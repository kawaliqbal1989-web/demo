import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

async function hashPassword(rawPassword) {
  return bcrypt.hash(rawPassword, SALT_ROUNDS);
}

async function verifyPassword(rawPassword, passwordHash) {
  return bcrypt.compare(rawPassword, passwordHash);
}

export { hashPassword, verifyPassword };
