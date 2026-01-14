// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/ISovryFactory.sol";
import "../interfaces/ISovryExchange.sol";

error InvalidAddress();
error NotAuthorized();
error TransferFailed();
error LaunchFeeTooLow();

contract SovryFactory is AccessControl, ISovryFactory {
    uint256 public launchFee = 1 ether;

    ISovryExchange public immutable exchange;

    constructor(address exchangeAddress) {
        if (exchangeAddress == address(0)) revert InvalidAddress();
        exchange = ISovryExchange(exchangeAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setLaunchFee(uint256 newFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        launchFee = newFee;
    }

    function launchToken(
        address rtAddress,
        uint256 amount,
        string calldata name,
        string calldata symbol,
        uint256 basePrice,
        uint256 priceIncrement
    ) external payable returns (address wrapperAddress) {
        uint256 fee = launchFee;
        if (msg.value < fee) revert LaunchFeeTooLow();

        address treasury = exchange.treasury();
        if (treasury == address(0)) revert InvalidAddress();

        if (fee > 0) {
            (bool ok, ) = payable(treasury).call{value: fee}("");
            if (!ok) revert TransferFailed();
        }

        if (msg.value > fee) {
            (bool refundOk, ) = payable(msg.sender).call{value: msg.value - fee}("");
            if (!refundOk) revert TransferFailed();
        }

        wrapperAddress = exchange.launchTokenFromFactory(
            rtAddress,
            amount,
            name,
            symbol,
            basePrice,
            priceIncrement,
            msg.sender
        );

        emit TokenLaunched(rtAddress, wrapperAddress, msg.sender, amount, block.timestamp);
    }

    receive() external payable {}
}
