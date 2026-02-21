// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IRoyaltyModule.sol";

/**
 * @notice Mock implementation of Story Protocol Royalty Workflows
 * @dev Used for testing - sends 1 ETH to the claimer on each claimAllRevenue call
 */
contract MockRoyaltyWorkflows is IRoyaltyModule, IIpRoyaltyVault {
    event PayRoyaltyOnBehalfCalled(address indexed childIpId, address indexed payer, address indexed currencyToken, uint256 amount);

    address public wipToken;

    address public lastChildIpId;
    address public lastPayer;
    address public lastCurrencyToken;
    uint256 public lastAmount;
    uint256 public totalRoyaltyPaid;

    function ipRoyaltyVaults(address) external view override returns (address) {
        return address(this);
    }

    function claimableRevenue(address, address) external pure override returns (uint256) {
        return 0;
    }

    function claimRevenueOnBehalfByTokenBatch(address claimer, address[] calldata tokenList) external override returns (uint256[] memory) {
        uint256[] memory amounts = new uint256[](tokenList.length);
        uint256 transferred;

        if (wipToken != address(0)) {
            IERC20 token = IERC20(wipToken);
            uint256 bal = token.balanceOf(address(this));
            if (bal > 0) {
                token.transfer(claimer, bal);
                transferred = bal;
            }
        }

        // Fallback to sending 1 wei native if no WIP configured/funded
        if (transferred == 0) {
            (bool success, ) = payable(claimer).call{value: 1}("");
            require(success, "Transfer failed");
            transferred = 1;
        }

        if (tokenList.length > 0) {
            amounts[0] = transferred;
        }
        
        return amounts;
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

    function setWipToken(address _wipToken) external {
        wipToken = _wipToken;
    }

    // Allow contract to receive ETH
    receive() external payable {}
}
