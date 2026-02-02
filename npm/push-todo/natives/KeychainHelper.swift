#!/usr/bin/env swift
/**
 * Push Keychain Helper
 *
 * Retrieves the E2EE encryption key from iCloud Keychain.
 * Used by the push-todo CLI for decrypting end-to-end encrypted tasks.
 *
 * Exit codes:
 *   0 - Success (key printed to stdout as base64)
 *   1 - Key not found in Keychain
 *   2 - iCloud Keychain not available
 *   3 - Other error
 *
 * Build:
 *   swiftc -O KeychainHelper.swift -o push-keychain-helper
 */

import Foundation
import Security

/// Keychain service and account identifiers
/// Must match the iOS app's keychain storage
let keychainService = "ai.massless.push.e2ee"
let keychainAccount = "encryption-key"

/// Query the keychain for the E2EE encryption key
func getEncryptionKey() -> (Data?, OSStatus) {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: keychainService,
        kSecAttrAccount as String: keychainAccount,
        kSecAttrSynchronizable as String: kCFBooleanTrue!,  // iCloud Keychain
        kSecReturnData as String: kCFBooleanTrue!,
        kSecMatchLimit as String: kSecMatchLimitOne
    ]

    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)

    if status == errSecSuccess, let data = result as? Data {
        return (data, status)
    }

    return (nil, status)
}

/// Check if iCloud Keychain is available
func isICloudKeychainAvailable() -> Bool {
    // Try to query for any iCloud synced item
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrSynchronizable as String: kCFBooleanTrue!,
        kSecMatchLimit as String: kSecMatchLimitOne,
        kSecReturnAttributes as String: kCFBooleanTrue!
    ]

    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)

    // If we get errSecItemNotFound, iCloud Keychain is available but empty
    // If we get errSecSuccess, iCloud Keychain is available with items
    // Other errors may indicate iCloud Keychain is not available
    return status == errSecSuccess || status == errSecItemNotFound
}

/// Main entry point
func main() -> Int32 {
    // Handle --check flag
    if CommandLine.arguments.contains("--check") {
        if isICloudKeychainAvailable() {
            print("iCloud Keychain available")
            return 0
        } else {
            fputs("iCloud Keychain not available\n", stderr)
            return 2
        }
    }

    // Handle --help flag
    if CommandLine.arguments.contains("--help") || CommandLine.arguments.contains("-h") {
        print("""
        Usage: push-keychain-helper [options]

        Options:
          --check    Check if iCloud Keychain is available
          --help     Show this help

        Without options, retrieves and prints the E2EE key as base64.

        Exit codes:
          0 - Success
          1 - Key not found
          2 - iCloud Keychain not available
          3 - Other error
        """)
        return 0
    }

    // Check iCloud Keychain availability first
    if !isICloudKeychainAvailable() {
        fputs("Error: iCloud Keychain not available\n", stderr)
        return 2
    }

    // Get the encryption key
    let (keyData, status) = getEncryptionKey()

    switch status {
    case errSecSuccess:
        if let data = keyData {
            // Output as base64
            print(data.base64EncodedString())
            return 0
        } else {
            fputs("Error: Key data is nil\n", stderr)
            return 3
        }

    case errSecItemNotFound:
        fputs("Error: Encryption key not found in Keychain\n", stderr)
        fputs("Make sure E2EE is enabled in the Push iOS app\n", stderr)
        return 1

    case errSecAuthFailed:
        fputs("Error: Keychain authentication failed\n", stderr)
        return 3

    default:
        fputs("Error: Keychain error (status: \(status))\n", stderr)
        return 3
    }
}

exit(main())
