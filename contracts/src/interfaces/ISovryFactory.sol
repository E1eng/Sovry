// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ISovryFactory {
    event TokenLaunched(
        address indexed rt,
        address indexed wrapper,
        address indexed creator,
        uint256 amount,
        uint256 launchTime
    );

    function launchToken(
        address rtAddress,
        uint256 amount,
        address ipAsset,
        string calldata name,
        string calldata symbol
    ) external returns (address wrapperAddress);
}
