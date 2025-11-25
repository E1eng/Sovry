// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SovryToken is ERC20, Ownable {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        if (initialSupply_ > 0) {
            _mint(owner_, initialSupply_);
        }
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burnFrom(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
