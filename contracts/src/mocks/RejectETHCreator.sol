// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/ISovryExchange.sol";
import "../interfaces/ISovryFactory.sol";

contract RejectETHCreator {
    function launch(
        address factory,
        address exchange,
        address rt,
        uint256 amount,
        address ipAsset,
        string calldata name,
        string calldata symbol
    ) external payable returns (address wrapper) {
        IERC20(rt).approve(exchange, amount);

        wrapper = ISovryFactory(factory).launchToken{value: msg.value}(
            rt,
            amount,
            ipAsset,
            name,
            symbol
        );
    }

    function claimPending(address exchange, address payable to) external {
        ISovryExchange(exchange).withdrawPending(to);
    }

    receive() external payable {
        revert("RejectETH");
    }

    fallback() external payable {
        revert("RejectETH");
    }
}
