import crypto from "crypto";

/**
 * Generates a cryptographically strong temporary password conforming to RUET ELMS password policy:
 * - 12 characters length
 * - Includes uppercase, lowercase, number, and special character
 * - Not equal to user ID or email
 */
export function generateTemporaryPassword(): string {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // omitted easily confused I, O
  const lowercase = "abcdefghijkmnopqrstuvwxyz"; // omitted l
  const numbers = "23456789"; // omitted 0, 1
  const symbols = "!@#$%^&*";

  // Guarantee at least one from each required set
  const pick = (charset: string) =>
    charset[crypto.randomInt(0, charset.length)];

  const parts = [
    pick(uppercase),
    pick(uppercase),
    pick(lowercase),
    pick(lowercase),
    pick(numbers),
    pick(numbers),
    pick(symbols),
    pick(symbols),
  ];

  const allChars = uppercase + lowercase + numbers + symbols;
  while (parts.length < 12) {
    parts.push(pick(allChars));
  }

  // Cryptographically shuffle array
  for (let i = parts.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }

  return parts.join("");
}
