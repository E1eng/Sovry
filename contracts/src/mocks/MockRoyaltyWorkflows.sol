// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IRoyaltyModule.sol";

/**
 * @notice Mock implementation of Story Protocol Royalty Workflows
 * @dev Used for testing - sends 1 ETH to the claimer on each claimAllRevenue call
 */
contract MockRoyaltyWorkflows is IRoyaltyModule {
    event PayRoyaltyOnBehalfCalled(address indexed childIpId, address indexed payer, address indexed currencyToken, uint256 amount);

    address public lastChildIpId;
    address public lastPayer;
    address public lastCurrencyToken;
    uint256 public lastAmount;
    uint256 public totalRoyaltyPaid;

    /**
     * @notice Mock claimAllRevenue that sends 1 ETH to claimer
     * @dev Returns array of amounts claimed (1 ETH for each currency token)
     */
    function claimAllRevenue(
        address,
        address claimer,
        address[] calldata,
        address[] calldata,
        address[] calldata currencyTokens
    ) external returns (uint256[] memory amountsClaimed) {
        // Create return array with same length as currencyTokens
        amountsClaimed = new uint256[](currencyTokens.length);
        
        // Send 1 ETH to claimer for each currency token
        uint256 totalAmount = 1 ether;
        (bool success, ) = payable(claimer).call{value: totalAmount}("");
        require(success, "Transfer failed");
        
        // Fill return array with 1 ETH for each token
        for (uint256 i = 0; i < currencyTokens.length; i++) {
            amountsClaimed[i] = 1 ether;
        }
    }

    function payRoyaltyOnBehalf(address childIpId, address payer, address currencyToken, uint256 amount) external override {
        lastChildIpId = childIpId;
        lastPayer = payer;
        lastCurrencyToken = currencyToken;
        lastAmount = amount;
        totalRoyaltyPaid += amount;

        IERC20(currencyToken).transferFrom(payer, childIpId, amount);

        emit PayRoyaltyOnBehalfCalled(childIpId, payer, currencyToken, amount);
    }

    // Allow contract to receive ETH
    receive() external payable {}
}
