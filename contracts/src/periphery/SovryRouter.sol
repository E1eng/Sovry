// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../interfaces/ISovryRouter.sol";
import "../interfaces/ISovryFactory.sol";
import "../interfaces/ISovryExchange.sol";

error InvalidAddress();

contract SovryRouter is ISovryRouter {
    ISovryFactory private immutable factory_;
    ISovryExchange private immutable exchange_;
    address private immutable weth_;

    constructor(address factoryAddress, address exchangeAddress, address wethAddress) {
        if (factoryAddress == address(0)) revert InvalidAddress();
        if (exchangeAddress == address(0)) revert InvalidAddress();
        if (wethAddress == address(0)) revert InvalidAddress();

        factory_ = ISovryFactory(factoryAddress);
        exchange_ = ISovryExchange(exchangeAddress);
        weth_ = wethAddress;
    }

    function factory() external view returns (address) {
        return address(factory_);
    }

    function exchange() external view returns (address) {
        return address(exchange_);
    }

    function weth() external view returns (address) {
        return weth_;
    }

    function launchToken(
        address rtAddress,
        uint256 amount,
        address ipAsset,
        string calldata name,
        string calldata symbol
    ) external returns (address wrapperAddress) {
        wrapperAddress = factory_.launchToken(rtAddress, amount, ipAsset, name, symbol);
    }

    function buyETH(
        address wrapperToken,
        uint256 amount,
        uint256 maxEthCost,
        uint256 deadline
    ) external payable {
        exchange_.buy{value: msg.value}(wrapperToken, amount, maxEthCost, deadline, msg.sender);
    }

    function sell(
        address wrapperToken,
        uint256 amount,
        uint256 minEthProceeds,
        uint256 deadline
    ) external {
        exchange_.sell(wrapperToken, amount, minEthProceeds, deadline, msg.sender);
    }

    function quoteBuy(address wrapperToken, uint256 amount) external view returns (uint256) {
        return exchange_.calculateBuyPrice(wrapperToken, amount);
    }

    function quoteSell(address wrapperToken, uint256 amount) external view returns (uint256) {
        return exchange_.calculateSellPrice(wrapperToken, amount);
    }

    receive() external payable {}
}
