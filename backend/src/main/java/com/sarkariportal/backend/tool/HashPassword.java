package com.sarkariportal.backend.tool;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/**
 * One-off command-line helper: turns a password into the BCrypt hash that
 * ADMIN_PASSWORD_HASH expects. Not part of the running application.
 *
 * Run it with:
 *   mvn -q compile exec:java \
 *       -Dexec.mainClass=com.sarkariportal.backend.tool.HashPassword \
 *       -Dexec.args="your-password-here"
 *
 * Then set the printed value as the ADMIN_PASSWORD_HASH environment variable.
 * The plaintext password should never be written to a file in this repo.
 *
 * Note the cost of 12 matches SecurityConfig's encoder. A hash generated at a
 * different cost still verifies correctly -- BCrypt stores the cost inside the
 * hash -- so this only affects how long verification takes.
 */
public final class HashPassword {

    private HashPassword() {
    }

    public static void main(String[] args) {
        if (args.length != 1 || args[0].isBlank()) {
            System.err.println("Usage: HashPassword \"<password>\"");
            System.exit(1);
            return;
        }

        String password = args[0];
        if (password.length() < 12) {
            System.err.println("Refusing to hash a password shorter than 12 characters.");
            System.err.println("This is the only credential protecting every write endpoint.");
            System.exit(1);
            return;
        }

        String hash = new BCryptPasswordEncoder(12).encode(password);

        System.out.println();
        System.out.println("BCrypt hash (set this as ADMIN_PASSWORD_HASH):");
        System.out.println();
        System.out.println("  " + hash);
        System.out.println();
        System.out.println("On Windows PowerShell, for the current session:");
        System.out.println("  $env:ADMIN_PASSWORD_HASH = '" + hash + "'");
        System.out.println();
        System.out.println("Do not commit this value, and do not keep the plaintext anywhere.");
        System.out.println();
    }
}
