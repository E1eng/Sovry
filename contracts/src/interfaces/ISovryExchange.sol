// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ISovryExchange {
    event TokensPurchased(
        address indexed buyer,
        address indexed wrapperToken,
        uint256 amount,
        uint256 cost,
        uint256 feeAmount,
        address feeRecipient
    );

    event TokensSold(
        address indexed seller,
        address indexed wrapperToken,
        uint256 amount,
        uint256 proceeds,
        uint256 feeAmount,
        address feeRecipient
    );

    event TokensRedeemed(
        address indexed redeemer,
        address indexed wrapperToken,
        uint256 wrapperAmount,
        uint256 rtAmount,
        address indexed recipient
    );

    event PendingWithdrawal(address indexed beneficiary, uint256 amount);

    event RoyaltiesHarvested(address indexed wrapperToken, uint256 amount);

    event Graduated(address indexed wrapperToken, uint256 liquidity, address indexed poolAddress);

    event GraduationThresholdUpdated(uint256 newThreshold);

    function treasury() external view returns (address);

    function graduationThreshold() external view returns (uint256);

    function KEEPER_ROLE() external view returns (bytes32);

    function setFactory(address factoryAddress) external;

    function setRouter(address routerAddress) external;

    function launchTokenFromFactory(
        address rtAddress,
        uint256 amount,
        address ipAsset,
        string calldata name,
        string calldata symbol,
        address creator
    ) external returns (address wrapperAddress);

    function calculateBuyPrice(address wrapperToken, uint256 amount) external view returns (uint256);

    function calculateSellPrice(address wrapperToken, uint256 amount) external view returns (uint256);

    function buy(
        address wrapperToken,
        uint256 amount,
        uint256 maxEthCost,
        uint256 deadline,
        address recipient
    ) external payable;

    function sell(
        address wrapperToken,
        uint256 amount,
        uint256 minEthProceeds,
        uint256 deadline,
        address seller
    ) external;

    function redeem(address wrapperToken, uint256 wrapperAmount, address recipient) external returns (uint256 rtAmount);

    function queueLaunchFee(address beneficiary) external payable;

    function depositRoyalties(address wrapperToken, uint256 wipAmount, uint256 amountOutMin) external;

    function pendingWithdrawals(address beneficiary) external view returns (uint256);

    function withdrawPending(address payable to) external;

    function graduate(address wrapperToken) external;

    function getMarketCap(address wrapperToken) external view returns (uint256);
}
