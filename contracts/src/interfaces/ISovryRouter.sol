// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ISovryRouter {
    function factory() external view returns (address);

    function exchange() external view returns (address);

    function weth() external view returns (address);

    function launchToken(
        address rtAddress,
        uint256 amount,
        string calldata name,
        string calldata symbol,
        uint256 basePrice,
        uint256 priceIncrement
    ) external payable returns (address wrapperAddress);

    function buyETH(
        address wrapperToken,
        uint256 amount,
        uint256 maxEthCost,
        uint256 deadline
    ) external payable;

    function sell(
        address wrapperToken,
        uint256 amount,
        uint256 minEthProceeds,
        uint256 deadline
    ) external;

    function quoteBuy(address wrapperToken, uint256 amount) external view returns (uint256);

    function quoteSell(address wrapperToken, uint256 amount) external view returns (uint256);
}
