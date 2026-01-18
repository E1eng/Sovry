// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title BondingCurveLib
 * @notice Library for bonding curve calculations
 * @dev Used to reduce contract size by extracting curve calculations
 */
library BondingCurveLib {

    struct Curve {
        uint256 basePrice;
        uint256 priceIncrement;
        uint256 currentSupply;
        uint256 reserveBalance;
        bool isActive;
    }

    /**
     * @notice Calculate buy price using linear bonding curve
     * @param basePrice Base price for the curve
     * @param priceIncrement Price increment per token unit
     * @param currentSupply Current supply in curve
     * @param initialCurveSupply Initial curve supply
     * @param amount Amount of tokens to buy (in wrapper units)
     * @param wrapUnit Wrapper unit for normalization
     * @return totalCost Total cost including base and increment
     */
    function calculateBuyPrice(
        uint256 basePrice,
        uint256 priceIncrement,
        uint256 currentSupply,
        uint256 initialCurveSupply,
        uint256 amount,
        uint256 wrapUnit
    ) internal pure returns (uint256 totalCost) {
        uint256 soldRaw = initialCurveSupply > currentSupply ? (initialCurveSupply - currentSupply) : 0;
        uint256 soldUnits = soldRaw / wrapUnit;
        uint256 amountUnits = amount / wrapUnit;
        return buyCost(basePrice, priceIncrement, soldUnits, amountUnits);
    }

    /**
     * @notice Calculate sell price using linear bonding curve
     * @param basePrice Base price for the curve
     * @param priceIncrement Price increment per token unit
     * @param currentSupply Current supply in curve
     * @param initialCurveSupply Initial curve supply
     * @param amount Amount of tokens to sell (in wrapper units)
     * @param wrapUnit Wrapper unit for normalization
     * @return totalProceeds Total proceeds before fees
     */
    function calculateSellPrice(
        uint256 basePrice,
        uint256 priceIncrement,
        uint256 currentSupply,
        uint256 initialCurveSupply,
        uint256 amount,
        uint256 wrapUnit
    ) internal pure returns (uint256 totalProceeds) {
        uint256 soldRaw = initialCurveSupply > currentSupply ? (initialCurveSupply - currentSupply) : 0;
        uint256 soldUnits = soldRaw / wrapUnit;
        uint256 amountUnits = amount / wrapUnit;
        return sellProceeds(basePrice, priceIncrement, soldUnits, amountUnits);
    }

    /**
     * @notice Check if curve is active
     * @param curve The bonding curve data
     * @return isActive_ True if curve is active
     */
    function isActive(Curve memory curve) internal pure returns (bool isActive_) {
        isActive_ = curve.isActive;
    }

    /**
     * @notice Get current price for buying one token
     * @param curve The bonding curve data
     * @param wrapUnit Wrapper unit for normalization
     * @return price Current price per token
     */
    function getCurrentPrice(Curve memory curve, uint256 wrapUnit) internal pure returns (uint256 price) {
        uint256 soldUnits = curve.currentSupply / wrapUnit;
        price = curve.basePrice + (soldUnits * curve.priceIncrement);
    }

    function buyCost(
        uint256 basePriceWei,
        uint256 priceIncrementWei,
        uint256 soldUnits,
        uint256 buyUnits
    ) internal pure returns (uint256) {
        if (buyUnits == 0) return 0;
        uint256 baseCost = basePriceWei * buyUnits;
        uint256 incrementCost = priceIncrementWei * ((soldUnits * buyUnits) + ((buyUnits * (buyUnits - 1)) / 2));
        return baseCost + incrementCost;
    }

    function sellProceeds(
        uint256 basePriceWei,
        uint256 priceIncrementWei,
        uint256 soldUnits,
        uint256 sellUnits
    ) internal pure returns (uint256) {
        if (sellUnits == 0) return 0;
        uint256 baseProceeds = basePriceWei * sellUnits;
        uint256 incrementProceeds = priceIncrementWei * ((sellUnits * (soldUnits - 1)) - ((sellUnits * (sellUnits - 1)) / 2));
        return baseProceeds + incrementProceeds;
    }

    function maxBuyUnits(
        uint256 basePriceWei,
        uint256 priceIncrementWei,
        uint256 soldUnits,
        uint256 ethIn,
        uint256 remainingUnits
    ) internal pure returns (uint256) {
        if (ethIn == 0 || remainingUnits == 0) return 0;

        if (priceIncrementWei == 0) {
            if (basePriceWei == 0) return 0;
            uint256 n0 = ethIn / basePriceWei;
            return n0 > remainingUnits ? remainingUnits : n0;
        }

        uint256 B = basePriceWei + (priceIncrementWei * soldUnits);
        uint256 D = (B * B) + (2 * priceIncrementWei * ethIn);
        uint256 sqrtD = Math.sqrt(D);
        if (sqrtD <= B) return 0;

        uint256 n = (sqrtD - B) / priceIncrementWei;
        if (n > remainingUnits) n = remainingUnits;

        while (n > 0 && buyCost(basePriceWei, priceIncrementWei, soldUnits, n) > ethIn) {
            unchecked {
                n -= 1;
            }
        }

        while (n < remainingUnits && buyCost(basePriceWei, priceIncrementWei, soldUnits, n + 1) <= ethIn) {
            unchecked {
                n += 1;
            }
        }

        return n;
    }
}
