// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IRoyaltyModule {
    function payRoyaltyOnBehalf(address receiverIpId, address payerIpId, address token, uint256 amount) external;
    function ipRoyaltyVaults(address ipId) external view returns (address);
}

interface IIpRoyaltyVault {
    function claimRevenueOnBehalfByTokenBatch(address claimer, address[] calldata tokenList) external returns (uint256[] memory);
    function claimableRevenue(address claimer, address token) external view returns (uint256);
}
