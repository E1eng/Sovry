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
        string calldata name,
        string calldata symbol,
        uint256 basePrice,
        uint256 priceIncrement,
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

    function harvest(address wrapperToken) external;

    function graduate(address wrapperToken) external;

    function getMarketCap(address wrapperToken) external view returns (uint256);
}
