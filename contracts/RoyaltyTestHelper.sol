// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal interface for Story Protocol RoyaltyModule
interface IRoyaltyModule {
    function payRoyaltyOnBehalf(
        address childIpId,
        address payer,
        address currencyToken,
        uint256 amount
    ) external;
}

/**
 * @title RoyaltyTestHelper
 * @notice Helper contract to test injecting royalties into Story IP Royalty Vaults.
 * @dev This contract is meant for testing / demo only and is not required
 *      for production use of SovryLaunchpad.
 */
contract RoyaltyTestHelper {
    /// @notice Story RoyaltyModule contract
    address public immutable royaltyModule;

    event RoyaltyInjected(
        address indexed sender,
        address indexed childIpId,
        address indexed currencyToken,
        uint256 amount
    );

    error InvalidAddress();
    error InvalidAmount();

    constructor(address _royaltyModule) {
        if (_royaltyModule == address(0)) revert InvalidAddress();
        royaltyModule = _royaltyModule;
    }

    /**
     * @notice Injects ERC20 royalties into a Story IP Royalty Vault
     * @param currencyToken Address of the ERC20 revenue token (e.g. WIP token)
     * @param childIpId IP ID of the child IP to pay royalties to
     * @param amount Amount of tokens to inject
     * @dev Caller must approve this contract to spend `amount` of `currencyToken` beforehand.
     */
    function injectRoyaltyERC20(
        address currencyToken,
        address childIpId,
        uint256 amount
    ) external {
        if (currencyToken == address(0)) revert InvalidAddress();
        if (childIpId == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        _injectRoyaltyERC20(msg.sender, currencyToken, childIpId, amount);
    }

    // Note: No harvest logic here by design; harvesting is triggered from the frontend via SovryLaunchpad.

    function _injectRoyaltyERC20(
        address payer,
        address currencyToken,
        address childIpId,
        uint256 amount
    ) internal {
        if (currencyToken == address(0)) revert InvalidAddress();
        if (childIpId == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        // Forward call to Story RoyaltyModule.
        // The caller (payer) must have approved the RoyaltyModule
        // to spend `amount` of `currencyToken` beforehand.
        IRoyaltyModule(royaltyModule).payRoyaltyOnBehalf(
            childIpId,
            payer,
            currencyToken,
            amount
        );

        emit RoyaltyInjected(payer, childIpId, currencyToken, amount);
    }
}
