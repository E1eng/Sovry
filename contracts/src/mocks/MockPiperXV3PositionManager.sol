// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IPiperXV3PositionManager.sol";

interface IMockPiperXV3Factory {
    function setPool(address token0, address token1, uint24 fee, address pool) external;
}

contract MockPiperXV3PositionManager is IPiperXV3PositionManager {
    address public immutable factory;

    bool public revertMint;
    uint256 public nextTokenId = 1;

    struct PositionTokens {
        address token0;
        address token1;
    }

    mapping(uint256 => PositionTokens) public positionTokens;

    struct FeeBalances {
        uint256 amount0;
        uint256 amount1;
    }

    mapping(uint256 => FeeBalances) public fees;

    event PoolCreated(address indexed token0, address indexed token1, uint24 fee, uint160 sqrtPriceX96, address pool);
    event MintCalled(uint256 indexed tokenId, address indexed token0, address indexed token1, uint24 fee, uint256 amount0, uint256 amount1);
    event CollectCalled(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1);

    constructor(address factory_) {
        factory = factory_;
    }

    function setRevertMint(bool value) external {
        revertMint = value;
    }

    function setFees(uint256 tokenId, uint256 amount0, uint256 amount1) external {
        fees[tokenId] = FeeBalances({ amount0: amount0, amount1: amount1 });
    }

    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool) {
        pool = address(uint160(uint256(keccak256(abi.encodePacked(token0, token1, fee, sqrtPriceX96, address(this))))));
        IMockPiperXV3Factory(factory).setPool(token0, token1, fee, pool);
        emit PoolCreated(token0, token1, fee, sqrtPriceX96, pool);
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        if (revertMint) {
            revert("Mock: mint reverted");
        }

        tokenId = nextTokenId;
        nextTokenId += 1;

        positionTokens[tokenId] = PositionTokens({ token0: params.token0, token1: params.token1 });

        amount0 = params.amount0Desired;
        amount1 = params.amount1Desired;

        if (amount0 > 0) {
            IERC20(params.token0).transferFrom(msg.sender, address(this), amount0);
        }
        if (amount1 > 0) {
            IERC20(params.token1).transferFrom(msg.sender, address(this), amount1);
        }

        uint256 liq = amount0 + amount1;
        liquidity = liq > type(uint128).max ? type(uint128).max : uint128(liq);

        emit MintCalled(tokenId, params.token0, params.token1, params.fee, amount0, amount1);
    }

    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        FeeBalances storage fb = fees[params.tokenId];
        PositionTokens memory pt = positionTokens[params.tokenId];
        require(pt.token0 != address(0) && pt.token1 != address(0), "Mock: unknown position");

        uint256 max0 = params.amount0Max;
        uint256 max1 = params.amount1Max;

        amount0 = fb.amount0 > max0 ? max0 : fb.amount0;
        amount1 = fb.amount1 > max1 ? max1 : fb.amount1;

        fb.amount0 -= amount0;
        fb.amount1 -= amount1;

        if (amount0 > 0) {
            IERC20(pt.token0).transfer(params.recipient, amount0);
        }
        if (amount1 > 0) {
            IERC20(pt.token1).transfer(params.recipient, amount1);
        }

        emit CollectCalled(params.tokenId, params.recipient, amount0, amount1);
    }
}
