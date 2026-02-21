// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title StealthForwarder
 * @notice Atomic stealth payment: forwards ETH and announces in one transaction.
 * @dev Minimal implementation for ERC-5564 stealth address payments.
 */
contract StealthForwarder {
    /// @notice ERC-5564 Announcer singleton address
    address public constant ANNOUNCER = 0x55649E01B5Df198D18D95b5cc5051630cfD45564;
    
    /// @notice Scheme ID for secp256k1 with view tags
    uint256 public constant SCHEME_ID = 1;

    /// @notice Emitted when a stealth payment is forwarded
    event StealthPayment(
        address indexed stealthAddress,
        uint256 amount
    );

    /**
     * @notice Forward ETH to a stealth address and announce.
     * @param stealthAddress The recipient stealth address
     * @param ephemeralPubKey The sender's ephemeral public key (compressed, 33 bytes)
     * @param viewTag Single byte view tag for fast scanning
     */
    function forward(
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes1 viewTag
    ) external payable {
        require(msg.value > 0, "No ETH sent");
        require(stealthAddress != address(0), "Invalid stealth address");
        require(ephemeralPubKey.length == 33, "Invalid ephemeral key length");

        // Forward ETH to stealth address
        (bool success,) = stealthAddress.call{value: msg.value}("");
        require(success, "ETH transfer failed");

        // Build metadata: viewTag (1 byte)
        // Minimal metadata - just the view tag for recipient scanning
        bytes memory metadata = abi.encodePacked(viewTag);

        // Announce via ERC-5564 Announcer
        (bool announceSuccess,) = ANNOUNCER.call(
            abi.encodeWithSignature(
                "announce(uint256,address,bytes,bytes)",
                SCHEME_ID,
                stealthAddress,
                ephemeralPubKey,
                metadata
            )
        );
        require(announceSuccess, "Announce failed");

        emit StealthPayment(stealthAddress, msg.value);
    }

    /**
     * @notice Forward with extended metadata (includes token info).
     * @param stealthAddress The recipient stealth address
     * @param ephemeralPubKey The sender's ephemeral public key
     * @param metadata Full metadata (viewTag + optional token info)
     */
    function forwardWithMetadata(
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external payable {
        require(msg.value > 0, "No ETH sent");
        require(stealthAddress != address(0), "Invalid stealth address");
        require(ephemeralPubKey.length == 33, "Invalid ephemeral key length");
        require(metadata.length >= 1, "Metadata must include view tag");

        // Forward ETH
        (bool success,) = stealthAddress.call{value: msg.value}("");
        require(success, "ETH transfer failed");

        // Announce
        (bool announceSuccess,) = ANNOUNCER.call(
            abi.encodeWithSignature(
                "announce(uint256,address,bytes,bytes)",
                SCHEME_ID,
                stealthAddress,
                ephemeralPubKey,
                metadata
            )
        );
        require(announceSuccess, "Announce failed");

        emit StealthPayment(stealthAddress, msg.value);
    }
}
