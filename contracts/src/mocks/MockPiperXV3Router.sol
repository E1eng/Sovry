// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../interfaces/IPiperXV3SwapRouter.sol";

contract MockPiperXV3Router is IPiperXV3SwapRouter {
    event ExactInputSingleCalled(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint256 value
    );

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        emit ExactInputSingleCalled(
            params.tokenIn,
            params.tokenOut,
            params.fee,
            params.recipient,
            params.amountIn,
            params.amountOutMinimum,
            msg.value
        );
        return params.amountOutMinimum;
    }
}
