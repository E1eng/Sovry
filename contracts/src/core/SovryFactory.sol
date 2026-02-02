// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/ISovryFactory.sol";
import "../interfaces/ISovryExchange.sol";

error InvalidAddress();
error NotAuthorized();

contract SovryFactory is AccessControl, ISovryFactory {
    ISovryExchange public immutable exchange;

    constructor(address exchangeAddress) {
        if (exchangeAddress == address(0)) revert InvalidAddress();
        exchange = ISovryExchange(exchangeAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function launchToken(
        address rtAddress,
        uint256 amount,
        address ipAsset,
        string calldata name,
        string calldata symbol
    ) external returns (address wrapperAddress) {
        if (ipAsset == address(0)) revert InvalidAddress();

        address treasury = exchange.treasury();
        if (treasury == address(0)) revert InvalidAddress();

        wrapperAddress = exchange.launchTokenFromFactory(
            rtAddress,
            amount,
            ipAsset,
            name,
            symbol,
            msg.sender
        );

        emit TokenLaunched(rtAddress, wrapperAddress, msg.sender, amount, block.timestamp);
    }

    receive() external payable {}
}
