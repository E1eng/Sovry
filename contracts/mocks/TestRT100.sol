// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @notice Simple 6-decimal RT test token with fixed total supply of 100 tokens
 */
contract TestRT100 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        // Mint 100 tokens (6 decimals) to deployer
        _mint(msg.sender, 100 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}