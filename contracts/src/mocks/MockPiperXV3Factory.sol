// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract MockPiperXV3Factory {
    mapping(bytes32 => address) private pools;
    mapping(uint24 => int24) private tickSpacings;

    constructor() {
        tickSpacings[10_000] = 200;
    }

    function setPool(address token0, address token1, uint24 fee, address pool) external {
        pools[_key(token0, token1, fee)] = pool;
        pools[_key(token1, token0, fee)] = pool;
    }

    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool) {
        return pools[_key(tokenA, tokenB, fee)];
    }

    function setTickSpacing(uint24 fee, int24 spacing) external {
        tickSpacings[fee] = spacing;
    }

    function feeAmountTickSpacing(uint24 fee) external view returns (int24) {
        return tickSpacings[fee];
    }

    function _key(address tokenA, address tokenB, uint24 fee) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(tokenA, tokenB, fee));
    }
}
