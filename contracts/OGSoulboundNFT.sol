// contracts/OGSoulboundNFT.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract OGSoulboundNFT is ERC721URIStorage, Ownable {
    uint256 private _tokenIdCounter;

    constructor() ERC721("OG Card", "OGSBT") {}

    function safeMint(address to, string memory uri) public onlyOwner {
        _tokenIdCounter++;
        _safeMint(to, _tokenIdCounter);
        _setTokenURI(_tokenIdCounter, uri);
    }

    function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId,
    uint256 batchSize
) internal virtual override {
    super._beforeTokenTransfer(from, to, tokenId, batchSize);

    // Izinkan minting (from == 0x0) dan burning (to == 0x0) untuk siapa saja.
    if (from == address(0) || to == address(0)) {
        return;
    }

    // Untuk semua transfer lainnya, HANYA contract owner yang diizinkan.
    // _msgSender() adalah cara aman untuk mendapatkan alamat pengirim transaksi.
    require(_msgSender() == owner(), "Transfer: Hanya owner yang bisa mentransfer token ini");
}
}
