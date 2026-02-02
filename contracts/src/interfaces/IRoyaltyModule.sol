// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IRoyaltyModule {
    function payRoyaltyOnBehalf(address childIpId, address payer, address currencyToken, uint256 amount) external;

    function claimAllRevenue(address ipId, address receiver) external returns (uint256);
}
