// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721URIStorage } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract TestIpNft is ERC721URIStorage {
    uint256 public nextTokenId;

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {
        nextTokenId = 1;
    }

    function mint(address to, string calldata uri) external returns (uint256 tokenId) {
        tokenId = nextTokenId;
        nextTokenId = tokenId + 1;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }
}
