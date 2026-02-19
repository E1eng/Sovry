// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MockIPAssetRegistry {
    
    struct IPAsset {
        string name;
        string symbol;
        address owner;
        uint256 registrationTime;
    }
    
    mapping(address => IPAsset) public ipAssets;
    mapping(uint256 => address) public ipAssetById;
    uint256 public nextIpAssetId;
    
    event IPAssetRegistered(
        address indexed ipAsset,
        string name,
        string symbol,
        address indexed owner,
        uint256 ipAssetId
    );
    
    function registerIpAsset(
        string memory name,
        string memory symbol,
        address owner
    ) external returns (address ipAsset) {
        // Generate a deterministic address based on counter and msg.sender
        ipAsset = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            block.timestamp,
                            msg.sender,
                            nextIpAssetId
                        )
                    )
                )
            )
        );
        
        // Ensure it's not zero address
        if (ipAsset == address(0)) {
            ipAsset = address(1);
        }
        
        ipAssets[ipAsset] = IPAsset({
            name: name,
            symbol: symbol,
            owner: owner,
            registrationTime: block.timestamp
        });
        
        ipAssetById[nextIpAssetId] = ipAsset;
        nextIpAssetId++;
        
        emit IPAssetRegistered(ipAsset, name, symbol, owner, nextIpAssetId - 1);
        
        return ipAsset;
    }
    
    function isRegistered(address ipAsset) external view returns (bool) {
        return ipAssets[ipAsset].registrationTime > 0;
    }
    
    function getIPAsset(address ipAsset) external view returns (IPAsset memory) {
        return ipAssets[ipAsset];
    }
}
