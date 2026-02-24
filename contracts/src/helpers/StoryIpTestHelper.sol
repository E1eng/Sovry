// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { TestIpNft } from "./TestIpNft.sol";

interface IIPAssetRegistryMinimal {
    function register(uint256 chainid, address tokenContract, uint256 tokenId) external returns (address id);

    function ipId(uint256 chainId, address tokenContract, uint256 tokenId) external view returns (address);
}

interface IRoyaltyModuleMinimal {
    function deployVault(address ipId) external returns (address ipRoyaltyVault);

    function ipRoyaltyVaults(address ipId) external view returns (address);
}

contract StoryIpTestHelper {
    address public immutable ipAssetRegistry;
    address public immutable royaltyModule;
    TestIpNft public immutable testNft;

    constructor(address ipAssetRegistry_, address royaltyModule_) {
        ipAssetRegistry = ipAssetRegistry_;
        royaltyModule = royaltyModule_;
        testNft = new TestIpNft("Sovry Test IP", "SOVRYIP");
    }

    function mintAndRegisterIp(string calldata tokenUri) external returns (address ipId, uint256 tokenId) {
        tokenId = testNft.mint(msg.sender, tokenUri);
        ipId = IIPAssetRegistryMinimal(ipAssetRegistry).register(block.chainid, address(testNft), tokenId);
    }

    function predictIpId(uint256 tokenId) external view returns (address) {
        return IIPAssetRegistryMinimal(ipAssetRegistry).ipId(block.chainid, address(testNft), tokenId);
    }

    function deployRoyaltyVault(address ipId) external returns (address vault) {
        vault = IRoyaltyModuleMinimal(royaltyModule).deployVault(ipId);
    }

    function getRoyaltyVault(address ipId) external view returns (address) {
        return IRoyaltyModuleMinimal(royaltyModule).ipRoyaltyVaults(ipId);
    }

    function getRoyaltyTokenBalanceOnIpAccount(address ipId) external view returns (address vault, uint256 balance) {
        vault = IRoyaltyModuleMinimal(royaltyModule).ipRoyaltyVaults(ipId);
        if (vault == address(0)) return (address(0), 0);
        balance = IERC20(vault).balanceOf(ipId);
    }
}
