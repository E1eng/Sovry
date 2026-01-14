// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockPiperXRouter {
    // State to record the last addLiquidityETH call for assertions in tests
    address public lastToken;
    uint256 public lastAmountTokenDesired;
    uint256 public lastAmountETH;
    address public lastTo;

    // Flag to simulate addLiquidityETH failure in tests
    bool public revertAddLiquidity;

    // Dummy factory and WETH addresses to satisfy SovryLaunchpad's interface expectations
    address public factoryAddress;
    address public wethAddress;

    event AddLiquidityETHCalled(address token, uint256 amountTokenDesired, uint256 amountETH, address to);

    event SwapExactETHForTokensCalled(uint256 amountOutMin, address[] path, address to, uint256 amountIn);

    constructor() {
        // For testing we can just use this contract as the "factory"
        factoryAddress = address(this);
        // Dummy WETH address (non-zero to avoid confusion with address(0))
        wethAddress = address(0x0000000000000000000000000000000000000001);
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256,
        uint256,
        address to,
        uint256
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        if (revertAddLiquidity) {
            revert("Mock: addLiquidityETH reverted");
        }

        // Record call data for testing
        lastToken = token;
        lastAmountTokenDesired = amountTokenDesired;
        lastAmountETH = msg.value;
        lastTo = to;

        emit AddLiquidityETHCalled(token, amountTokenDesired, msg.value, to);

        // Simulate success
        return (amountTokenDesired, msg.value, 1000);
    }

    function setRevertAddLiquidity(bool value) external {
        revertAddLiquidity = value;
    }

    // Functions expected by IPiperXRouter interface
    function factory() external view returns (address) {
        return factoryAddress;
    }

    function WETH() external view returns (address) {
        return wethAddress;
    }

    // Minimal getPair implementation to satisfy IPiperXFactory(factory).getPair(...)
    // For tests we don't rely on the actual pair address, so we can just return a
    // deterministic pseudo-address derived from tokenA and tokenB.
    function getPair(address tokenA, address tokenB) external pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(tokenA, tokenB)))));
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external payable returns (uint256[] memory amounts) {
        emit SwapExactETHForTokensCalled(amountOutMin, path, to, msg.value);

        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = amountOutMin;
        return amounts;
    }
}